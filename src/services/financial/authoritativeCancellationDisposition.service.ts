import { createHash } from "node:crypto";
import { ClientSession, Types } from "mongoose";
import { BookingTerminationActorType as Actor, BookingTerminationType as Intent } from "../../enums/booking/bookingTerminationType.enum";
import { IAuthoritativeCancellationDisposition } from "../../models/booking.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { FINANCIAL_POLICY_VERSION } from "../booking/bookingCheckoutQuote.service";
import { CANCELLATION_CALCULATION_VERSION, calculateCancellationPolicy, CancellationScenario } from "./cancellationPolicyCalculation.service";
import { currencyMetadataService } from "./currencyMetadata.service";

export type DispositionReadiness =
  | { status: "READY"; disposition: IAuthoritativeCancellationDisposition }
  | { status: "NOT_READY" | "UNSUPPORTED" | "CONFLICT"; reason: string };

const validDate = (date: unknown): date is Date => date instanceof Date && Number.isFinite(date.getTime());
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function dispositionAuthorityFingerprint(d: IAuthoritativeCancellationDisposition): string {
  return hash({ operationKey: d.operationKey, actorType: d.actorType, actorId: d.actorId, intent: d.intent, scenario: d.scenario, policyVersion: d.policyVersion, calculationVersion: d.calculationVersion, interactionOutcome: d.interactionOutcome, receiptAt: d.receiptAt, scheduledStart: d.scheduledStart, currency: d.currency, currencyMinorUnits: d.currencyMinorUnits, serviceAmount: d.serviceAmount, customerPlatformFee: d.customerPlatformFee, originalChargeTotal: d.originalChargeTotal, breakdown: d.breakdown });
}

/** Explicitly called preparation only. This never dispatches or moves money. */
export async function admitAuthoritativeCancellationDisposition(input: {
  bookingId: Types.ObjectId; actorType: Actor; actorId?: Types.ObjectId; intent: Intent;
}, session?: ClientSession): Promise<DispositionReadiness> {
  try { return await admit(input, session); }
  catch { return { status: "NOT_READY", reason: "STORAGE_UNAVAILABLE" }; }
}

async function admit(input: {
  bookingId: Types.ObjectId; actorType: Actor; actorId?: Types.ObjectId; intent: Intent;
}, session?: ClientSession): Promise<DispositionReadiness> {
  const notReady = (reason: string): DispositionReadiness => ({ status: "NOT_READY", reason });
  const conflict = (reason: string): DispositionReadiness => ({ status: "CONFLICT", reason });
  // An uncommitted caller-owned transaction cannot establish durable readiness.
  if (session) return notReady("CALLER_TRANSACTION_NOT_COMMITTED");
  const booking = await bookingRepository.findForDispositionAdmission(input.bookingId, session);
  if (!booking) return notReady("BOOKING_MISSING");
  const claim = booking.terminationClaim;
  const evidence = booking.terminationEvidence;
  if (!claim || claim.status !== "ACTIVE") return notReady("ACTIVE_CLAIM_REQUIRED");
  const key = `booking-termination:${input.bookingId}`;
  if (claim.operationKey !== key || claim.actorType !== input.actorType || claim.intent !== input.intent || String(claim.actorId ?? "") !== String(input.actorId ?? "")) return conflict("CLAIM_IDENTITY_MISMATCH");
  if (String(claim.paymentId ?? "") !== String(booking.paymentId ?? "")) return conflict("CLAIM_PAYMENT_MISMATCH");
  if ((input.actorType === Actor.CUSTOMER && String(input.actorId) !== String(booking.userId)) || (input.actorType === Actor.CREATOR && String(input.actorId) !== String(booking.creatorId))) return conflict("ACTOR_MISMATCH");
  if (!evidence || evidence.version !== "TERMINATION_EVIDENCE_V1" || evidence.status !== "PENDING") return notReady("FROZEN_EVIDENCE_REQUIRED");
  if (evidence.operationKey !== key || evidence.intent !== input.intent || evidence.actorType !== input.actorType || String(evidence.actorId ?? "") !== String(input.actorId ?? "")) return conflict("EVIDENCE_IDENTITY_MISMATCH");
  if (!validDate(evidence.receiptAt) || !validDate(claim.evidenceReceiptAt) || evidence.receiptAt.getTime() !== claim.evidenceReceiptAt.getTime()) return notReady("RECEIPT_UNAVAILABLE");
  if (!validDate(evidence.recordedAt) || !["QUALIFIED", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"].includes(evidence.outcome) || (evidence.outcome === "QUALIFIED" && evidence.candidateMessageIds?.length !== 2)) return notReady("INTERACTION_EVIDENCE_UNRELIABLE");
  let scenario: CancellationScenario;
  if (input.actorType === Actor.CUSTOMER && input.intent === Intent.CUSTOMER_CANCELLED) {
    if (validDate(booking.creatorAcceptedAt) && booking.creatorAcceptedAt <= evidence.receiptAt) scenario = "CUSTOMER_AFTER_ACCEPTANCE";
    else if (!booking.creatorAcceptedAt && booking.status === "REQUESTED") scenario = "CUSTOMER_BEFORE_ACCEPTANCE";
    else return notReady("ACCEPTANCE_UNAVAILABLE");
  } else if (input.actorType === Actor.CREATOR && input.intent === Intent.CREATOR_CANCELLED) scenario = "CREATOR_CANCELLATION";
  else if ((input.actorType === Actor.CREATOR && input.intent === Intent.CREATOR_REJECTED) || (input.actorType === Actor.SYSTEM && input.intent === Intent.BOOKING_EXPIRED && !input.actorId)) scenario = "CUSTOMER_BEFORE_ACCEPTANCE";
  else return { status: "UNSUPPORTED", reason: "SCENARIO_UNSUPPORTED" };
  if (!validDate(booking.purchasedScheduledStart) || !booking.slotIds.length || new Set(booking.slotIds.map(String)).size !== booking.slotIds.length) return notReady("PURCHASED_SCHEDULE_UNAVAILABLE");
  if (booking.financialPolicyVersion !== FINANCIAL_POLICY_VERSION) return notReady("POLICY_UNAVAILABLE");
  if (!booking.checkoutQuoteId || !booking.checkoutQuoteFingerprint || !validDate(booking.checkoutQuoteIssuedAt) || !validDate(booking.checkoutQuoteExpiresAt)) return notReady("CHECKOUT_EVIDENCE_UNAVAILABLE");
  const quote = { customerId: String(booking.userId), creatorId: String(booking.creatorId), serviceId: String(booking.serviceId), slotIds: booking.slotIds.map(String).sort(), currency: booking.currency,
    serviceAmount: booking.serviceAmount, customerFeeAmount: booking.platformFeeAmount, totalAmount: booking.totalAmount, financialPolicyVersion: booking.financialPolicyVersion,
    financialPolicyContentReference: booking.financialPolicyContentReference ?? null, issuedAt: booking.checkoutQuoteIssuedAt.toISOString(), expiresAt: booking.checkoutQuoteExpiresAt.toISOString() };
  const fingerprint = hash(quote);
  if (fingerprint !== booking.checkoutQuoteFingerprint || booking.checkoutQuoteId !== `QUOTE_${fingerprint.slice(0, 24).toUpperCase()}`) return conflict("CHECKOUT_EVIDENCE_MISMATCH");
  const existing = booking.authoritativeDisposition;
  if (existing) {
    if (existing.version !== "CANCELLATION_DISPOSITION_V1" || existing.status !== "CALCULATED" || existing.executionStatus !== "NOT_EXECUTED" || existing.calculationVersion !== CANCELLATION_CALCULATION_VERSION || dispositionAuthorityFingerprint(existing) !== existing.authorityId || existing.operationKey !== key || existing.actorType !== input.actorType || existing.intent !== input.intent || String(existing.actorId ?? "") !== String(input.actorId ?? "") || existing.scenario !== scenario || existing.receiptAt?.getTime() !== evidence.receiptAt.getTime() || existing.scheduledStart?.getTime() !== booking.purchasedScheduledStart.getTime() || existing.interactionOutcome !== evidence.outcome || existing.serviceAmount !== booking.serviceAmount || existing.customerPlatformFee !== booking.platformFeeAmount || existing.originalChargeTotal !== booking.totalAmount || existing.currency !== booking.currency || existing.policyVersion !== booking.financialPolicyVersion) return conflict("AUTHORITY_CONFLICT");
    return { status: "READY", disposition: existing };
  }
  try {
    const currency = currencyMetadataService.normalize(booking.currency);
    if (currency !== booking.currency) return notReady("CURRENCY_INVALID");
    const breakdown = calculateCancellationPolicy({ serviceAmount: booking.serviceAmount, customerPlatformFee: booking.platformFeeAmount, originalChargeTotal: booking.totalAmount, currency, scenario, qualifyingTwoWayInteraction: evidence.outcome === "QUALIFIED", scheduledStartMs: booking.purchasedScheduledStart.getTime(), cancellationReceivedMs: evidence.receiptAt.getTime() });
    const frozen = { operationKey: key, actorType: input.actorType, actorId: input.actorId, intent: input.intent, scenario, policyVersion: booking.financialPolicyVersion, calculationVersion: CANCELLATION_CALCULATION_VERSION, interactionOutcome: evidence.outcome, receiptAt: evidence.receiptAt, scheduledStart: booking.purchasedScheduledStart, currency, currencyMinorUnits: currencyMetadataService.get(currency).minorUnits, serviceAmount: booking.serviceAmount, customerPlatformFee: booking.platformFeeAmount, originalChargeTotal: booking.totalAmount, breakdown };
    const authority: IAuthoritativeCancellationDisposition = { version: "CANCELLATION_DISPOSITION_V1", status: "CALCULATED", executionStatus: "NOT_EXECUTED", ...frozen, authorityId: hash(frozen), guardVersion: 0, recordedAt: new Date() };
    const stored = await bookingRepository.admitAuthoritativeDisposition(booking, authority, session);
    if (stored?.authoritativeDisposition) return { status: "READY", disposition: stored.authoritativeDisposition };
    const winnerBooking = await bookingRepository.findForDispositionAdmission(input.bookingId, session);
    const winner = winnerBooking?.authoritativeDisposition;
    if (winner?.authorityId === authority.authorityId && dispositionAuthorityFingerprint(winner) === winner.authorityId && winnerBooking?.terminationClaim?.status === "ACTIVE" && winnerBooking.terminationClaim.version === claim.version && winnerBooking.terminationEvidence?.status === "PENDING") return { status: "READY", disposition: winner };
    return winner ? conflict("AUTHORITY_CONFLICT") : notReady("ADMISSION_FAILED");
  } catch { return notReady("INVALID_PRICING_OR_PERSISTENCE"); }
}
