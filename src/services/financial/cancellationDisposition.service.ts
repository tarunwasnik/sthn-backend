import { ClientSession, Types } from "mongoose";
import { BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { IBooking, ICancellationDisposition, ITerminationEvidence } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";
import { currencyMetadataService } from "./currencyMetadata.service";
import { calculateCancellationPolicy, CANCELLATION_CALCULATION_VERSION, CancellationScenario } from "./cancellationPolicyCalculation.service";
import { FINANCIAL_POLICY_VERSION } from "../booking/bookingCheckoutQuote.service";

/** Shadow only: no external mutation, ledger posting, or authority to execute. */
export async function calculateCancellationDisposition(booking: IBooking, evidence: ITerminationEvidence, session?: ClientSession): Promise<ICancellationDisposition> {
  const base: ICancellationDisposition = {
    version: "CANCELLATION_DISPOSITION_V1", status: "PENDING", executionStatus: "NOT_EXECUTED",
    operationKey: evidence.operationKey, actorType: evidence.actorType, actorId: evidence.actorId,
    intent: evidence.intent, policyVersion: booking.financialPolicyVersion,
    calculationVersion: CANCELLATION_CALCULATION_VERSION, interactionOutcome: evidence.outcome,
    receiptAt: evidence.receiptAt, currency: booking.currency, serviceAmount: booking.serviceAmount,
    customerPlatformFee: booking.platformFeeAmount, originalChargeTotal: booking.totalAmount, recordedAt: new Date(),
  };
  const pending = (reason: string): ICancellationDisposition => ({ ...base, reason });
  if (evidence.operationKey !== `booking-termination:${booking._id}`) return pending("EVIDENCE_IDENTITY_MISMATCH");
  let scenario: CancellationScenario;
  if (evidence.intent === BookingTerminationType.CUSTOMER_CANCELLED) {
    if (booking.creatorAcceptedAt instanceof Date && Number.isFinite(booking.creatorAcceptedAt.getTime())) {
      if (!evidence.receiptAt || booking.creatorAcceptedAt > evidence.receiptAt) return pending("ACCEPTANCE_TIMING_UNCERTAIN");
      scenario = "CUSTOMER_AFTER_ACCEPTANCE";
    } else if (booking.status === "REQUESTED") scenario = "CUSTOMER_BEFORE_ACCEPTANCE";
    else return pending("ACCEPTANCE_EVIDENCE_UNAVAILABLE");
  } else if (evidence.intent === BookingTerminationType.CREATOR_CANCELLED) scenario = "CREATOR_CANCELLATION";
  else if (evidence.intent === BookingTerminationType.CREATOR_REJECTED || evidence.intent === BookingTerminationType.BOOKING_EXPIRED) scenario = "CUSTOMER_BEFORE_ACCEPTANCE";
  else return pending("SCENARIO_REQUIRES_AUTHORIZATION");
  base.scenario = scenario;
  if (!booking.financialPolicyVersion) return pending("FINANCIAL_POLICY_VERSION_UNAVAILABLE");
  if (booking.financialPolicyVersion !== FINANCIAL_POLICY_VERSION) return pending("FINANCIAL_POLICY_VERSION_UNSUPPORTED");
  if (!(evidence.receiptAt instanceof Date) || !Number.isFinite(evidence.receiptAt.getTime())) return pending("ORIGINAL_RECEIPT_UNAVAILABLE");
  const ids = booking.slotIds.map((id: Types.ObjectId) => String(id));
  if (!ids.length || new Set(ids).size !== ids.length) return pending("SCHEDULE_UNAVAILABLE");
  const slots = await Slot.find({ _id: { $in: booking.slotIds } }).select("startTime creatorId serviceId").session(session ?? null).lean().exec();
  if (slots.length !== ids.length || slots.some((slot) => !slot.creatorId.equals(booking.creatorId) || !slot.serviceId.equals(booking.serviceId) || !(slot.startTime instanceof Date) || !Number.isFinite(slot.startTime.getTime()))) return pending("SCHEDULE_UNAVAILABLE");
  const scheduledStart = new Date(Math.min(...slots.map((slot) => slot.startTime.getTime())));
  base.scheduledStart = scheduledStart;
  try {
    const currency = currencyMetadataService.normalize(booking.currency);
    if (currency !== booking.currency) return pending("INVALID_PRICING_SNAPSHOT");
    base.currencyMinorUnits = currencyMetadataService.get(currency).minorUnits;
    const breakdown = calculateCancellationPolicy({ serviceAmount: booking.serviceAmount, customerPlatformFee: booking.platformFeeAmount,
      originalChargeTotal: booking.totalAmount, currency, scenario, qualifyingTwoWayInteraction: evidence.outcome === "QUALIFIED",
      scheduledStartMs: scheduledStart.getTime(), cancellationReceivedMs: evidence.receiptAt.getTime() });
    return { ...base, status: "CALCULATED", breakdown };
  } catch {
    return pending("INVALID_PRICING_SNAPSHOT");
  }
}
