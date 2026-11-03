import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { PayoutSourceType } from "../../enums/financial/payoutSourceType.enum";
import { PayoutStatus } from "../../enums/financial/payoutStatus.enum";
import { creatorPayoutAuthorizationRepository as repository } from "../../repositories/creatorPayoutAuthorization.repository";
import { generateFinancialReference } from "../../utils/financial/reference.util";

/**
 * This reader is the future authority boundary. Implementations must read a
 * durable approval and fence entitlement, allocation, refund and release
 * changes in the supplied transaction. No production implementation exists
 * while CreatorEntitlement has no production eligibility reader.
 */
export interface AuthorizedCreatorPayoutEligibility {
  authority: string;
  decisionId: string;
  entitlementId: Types.ObjectId;
  creatorId: Types.ObjectId;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  payoutDestinationId: Types.ObjectId;
  destinationCountry: string;
  provider: PaymentProvider;
  amount: number;
  currency: SupportedCurrency;
  eligibilityState: "ELIGIBLE" | "HELD";
  hasUnresolvedFinancialLock: boolean;
  hasConflictingObligation: boolean;
}

export interface AuthorizedCreatorPayoutEligibilityReader {
  readAuthorized(authority: string, decisionId: string, session: ClientSession): Promise<AuthorizedCreatorPayoutEligibility | null>;
}

/** Capability evidence must originate from a registered, non-simulator provider adapter in production. */
export interface PayoutCapabilityReader {
  capabilities(provider: PaymentProvider): {
    payoutAvailable: boolean;
    idempotent: boolean;
    authenticatedLookup: boolean;
    simulator: boolean;
    destinationTypes: readonly PayoutDestinationType[];
    currencies: readonly SupportedCurrency[];
    countries: readonly string[];
  } | null;
}

export class CreatorPayoutAuthorizationError extends Error {
  constructor(message: string, readonly code: "INVALID" | "NOT_AUTHORIZED" | "CONFLICT" | "INTEGRITY" | "UNSUPPORTED") { super(message); }
}

const bounded = (value: string) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 200;
const country = (value: string) => typeof value === "string" && /^[A-Z]{2}$/.test(value);
const fingerprint = (value: AuthorizedCreatorPayoutEligibility) => crypto.createHash("sha256").update(JSON.stringify([
  value.authority, value.decisionId, String(value.entitlementId), String(value.creatorId), String(value.bookingId), String(value.paymentId),
  String(value.payoutDestinationId), value.destinationCountry, value.provider, value.amount, value.currency,
  value.eligibilityState, value.hasUnresolvedFinancialLock, value.hasConflictingObligation,
])).digest("hex");
const operationKey = (authority: string, decisionId: string) => `creator-payout-authorization:${crypto.createHash("sha256").update(`${authority}:${decisionId}`).digest("hex")}`;

export class CreatorPayoutAuthorizationService {
  constructor(private readonly eligibilityReader: AuthorizedCreatorPayoutEligibilityReader, private readonly capabilityReader: PayoutCapabilityReader) {}

  /**
   * Creates an approved local obligation only. It intentionally never gets a
   * provider adapter, decrypts a destination, posts a ledger entry, or mutates
   * a wallet/CreatorBalance.
   */
  async authorize(input: { authority: string; decisionId: string }): Promise<{ authorizationId: string; payoutId: string; state: "AUTHORIZED"; replayed: boolean }> {
    if (!bounded(input.authority) || !bounded(input.decisionId)) throw new CreatorPayoutAuthorizationError("Invalid decision identity.", "INVALID");
    const session = await mongoose.startSession();
    let outcome: { authorizationId: string; payoutId: string; state: "AUTHORIZED"; replayed: boolean } | undefined;
    try {
      await session.withTransaction(async () => {
        const decision = await this.eligibilityReader.readAuthorized(input.authority, input.decisionId, session);
        if (!decision || decision.authority !== input.authority || decision.decisionId !== input.decisionId) throw new CreatorPayoutAuthorizationError("Creator payout is not authorized.", "NOT_AUTHORIZED");
        if (!SUPPORTED_CURRENCIES.includes(decision.currency) || !Number.isSafeInteger(decision.amount) || decision.amount <= 0 || !country(decision.destinationCountry) ||
          !Types.ObjectId.isValid(decision.entitlementId) || !Types.ObjectId.isValid(decision.creatorId) || !Types.ObjectId.isValid(decision.bookingId) || !Types.ObjectId.isValid(decision.paymentId) || !Types.ObjectId.isValid(decision.payoutDestinationId)) {
          throw new CreatorPayoutAuthorizationError("Creator payout decision is invalid.", "INVALID");
        }
        if (decision.eligibilityState !== "ELIGIBLE" || decision.hasUnresolvedFinancialLock || decision.hasConflictingObligation) {
          throw new CreatorPayoutAuthorizationError("Creator entitlement is not eligible for payout.", "NOT_AUTHORIZED");
        }
        const key = fingerprint(decision);
        const existing = await repository.findByDecision(input.authority, input.decisionId, session);
        if (existing) {
          if (existing.fingerprint !== key) throw new CreatorPayoutAuthorizationError("Creator payout decision identity conflicts.", "CONFLICT");
          outcome = { authorizationId: String(existing._id), payoutId: String(existing.payoutId), state: "AUTHORIZED", replayed: true };
          return;
        }
        const capability = this.capabilityReader.capabilities(decision.provider);
        if (!capability?.payoutAvailable || !capability.idempotent || !capability.authenticatedLookup || capability.simulator ||
          !capability.currencies.includes(decision.currency) || !capability.countries.includes(decision.destinationCountry)) {
          throw new CreatorPayoutAuthorizationError("Payout provider capability is unavailable for this corridor.", "UNSUPPORTED");
        }
        const entitlement = await repository.findGraph(decision.entitlementId, session);
        if (!entitlement || entitlement.state !== "ELIGIBLE" || !entitlement.creatorId.equals(decision.creatorId) || !entitlement.bookingId.equals(decision.bookingId) ||
          !entitlement.paymentId.equals(decision.paymentId) || entitlement.currency !== decision.currency || decision.amount > entitlement.creatorAmount) {
          throw new CreatorPayoutAuthorizationError("Eligible creator entitlement does not reconcile.", "INTEGRITY");
        }
        const financial = await repository.findCurrentFinancialAuthority(decision.bookingId, session);
        if (financial.dispute) {
          const allocation = financial.allocation;
          if (financial.dispute.status === "OPEN" || financial.appeal?.status === "OPEN" || !allocation ||
            !allocation.entitlementId.equals(entitlement._id) || !allocation.paymentId.equals(entitlement.paymentId) ||
            !allocation.creatorId.equals(entitlement.creatorId) || allocation.currency !== entitlement.currency ||
            allocation.approvedCreatorAmount !== decision.amount) {
            throw new CreatorPayoutAuthorizationError("Current financial allocation does not authorize this payout.", "NOT_AUTHORIZED");
          }
        } else if (decision.amount !== entitlement.creatorAmount) {
          throw new CreatorPayoutAuthorizationError("Payout amount does not match the undisputed entitlement.", "NOT_AUTHORIZED");
        }
        const [booking, payment, operation] = await repository.findBookingPaymentAndOperation(decision.bookingId, decision.paymentId, session);
        if (!booking || !payment || !operation || !booking.paymentId?.equals(payment._id) || !payment.bookingId.equals(booking._id) || !booking.creatorId.equals(decision.creatorId) ||
          !payment.creatorId.equals(decision.creatorId) || payment.method === PaymentMethod.WALLET || booking.paymentMethod !== payment.method || payment.status !== PaymentStatus.CAPTURED ||
          payment.currency !== decision.currency || booking.currency !== decision.currency || payment.amount !== entitlement.totalAmount || booking.totalAmount !== payment.amount ||
          !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) || operation.status !== PaymentOperationStatus.CONFIRMED || operation.providerStatus !== "CAPTURED" ||
          !operation.confirmedAt || operation.provider !== payment.provider || operation.providerPaymentId !== payment.providerPaymentId || operation.requestedAmount !== payment.amount ||
          operation.verifiedAmount !== payment.amount || operation.requestedCurrency !== payment.currency || operation.verifiedCurrency !== payment.currency) {
          throw new CreatorPayoutAuthorizationError("Booking and confirmed payment evidence do not reconcile.", "INTEGRITY");
        }
        const destination = await repository.findDestination(decision.payoutDestinationId, session);
        if (!destination || !destination.creatorId.equals(decision.creatorId) || !destination.isActive || destination.verificationStatus !== PayoutDestinationVerificationStatus.VERIFIED || !destination.verifiedAt || !destination.verifiedCountry || destination.verifiedCountry !== decision.destinationCountry ||
          !capability.destinationTypes.includes(destination.type)) {
          throw new CreatorPayoutAuthorizationError("Payout destination is not eligible for the selected provider.", "INTEGRITY");
        }
        // Serialize with refund/allocation authorization boundaries sharing this captured payment.
        const fenced = await repository.fencePayment(payment._id as Types.ObjectId, booking._id as Types.ObjectId, session);
        if (fenced.modifiedCount !== 1) throw new CreatorPayoutAuthorizationError("Payout authorization fence conflicts.", "CONFLICT");
        const payout = await repository.createPayout({
          payoutReference: generateFinancialReference("PAYOUT"), sourceType: PayoutSourceType.ENTITLEMENT,
          entitlementId: entitlement._id, payoutDestinationId: destination._id, creatorId: decision.creatorId,
          bookingId: booking._id, paymentId: payment._id, amount: decision.amount, currency: decision.currency,
          status: PayoutStatus.CREATED, provider: decision.provider, attemptNumber: 1, retryable: false,
          idempotencyKey: operationKey(decision.authority, decision.decisionId), providerPayload: {},
          attributes: { authorizationOnly: true, destinationReference: destination.destinationReference, destinationType: destination.type, destinationCountry: decision.destinationCountry },
        }, session);
        const authorization = await repository.createAuthorization({
          authority: decision.authority, decisionId: decision.decisionId, fingerprint: key, entitlementId: entitlement._id, payoutId: payout._id,
          creatorId: decision.creatorId, bookingId: booking._id, paymentId: payment._id, payoutDestinationId: destination._id,
          destinationReference: destination.destinationReference, destinationType: destination.type, destinationCountry: decision.destinationCountry,
          provider: decision.provider, amount: decision.amount, currency: decision.currency, state: "AUTHORIZED",
        }, session);
        outcome = { authorizationId: String(authorization._id), payoutId: String(payout._id), state: "AUTHORIZED", replayed: false };
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const winner = await repository.findByDecision(input.authority, input.decisionId);
        if (!winner) throw new CreatorPayoutAuthorizationError("Creator entitlement already has a conflicting payout obligation.", "CONFLICT");
        return this.authorize(input);
      }
      throw error;
    } finally { await session.endSession(); }
    if (!outcome) throw new CreatorPayoutAuthorizationError("Creator payout authorization did not commit.", "INTEGRITY");
    return outcome;
  }
}
