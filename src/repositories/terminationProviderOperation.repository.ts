import mongoose, { ClientSession, Types } from "mongoose";
import { ITerminationProviderOperation, TerminationProviderOperation, TerminationProviderOperationStatus } from "../models/terminationProviderOperation.model";
import { Booking } from "../models/booking.model";
import { paymentProviderRegistry } from "../services/financial/paymentProviderRegistry.service";
import { Payment } from "../models/payment.model";
import { PaymentStatus } from "../enums/financial/paymentStatus.enum";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import { dispositionAuthorityFingerprint } from "../services/financial/authoritativeCancellationDisposition.service";
import { CANCELLATION_CALCULATION_VERSION } from "../services/financial/cancellationPolicyCalculation.service";
import { FINANCIAL_POLICY_VERSION } from "../services/booking/bookingCheckoutQuote.service";

/** Low-level CAS primitives only; the recovery authority must validate provider evidence. */
export class TerminationProviderOperationRepository {
  findByClaimKey(claimKey: string, session?: ClientSession) {
    return TerminationProviderOperation.findOne({ claimKey }).session(session ?? null).exec();
  }

  create(input: Partial<ITerminationProviderOperation>, session?: ClientSession) {
    return TerminationProviderOperation.create([input], { session, ...(session ? {} : { writeConcern: { w: "majority" as const } }) }).then((records) => records[0]);
  }

  markDispatched(id: Types.ObjectId) {
    return TerminationProviderOperation.findOneAndUpdate(
      { _id: id, status: "PENDING", attemptedAt: { $exists: false }, $or: [{ dispatchMode: "LEGACY" }, { dispatchMode: { $exists: false } }] },
      { $set: { status: "IN_FLIGHT", attemptedAt: new Date() } },
      { new: true, runValidators: true, writeConcern: { w: "majority" } },
    ).exec();
  }

  /** Dormant guarded marker only: no provider invocation. The transaction writes both
   * records so a concurrent claim/disposition change causes a write conflict. */
  async markDispositionDispatched(id: Types.ObjectId, authorityId: string): Promise<{ status: "MARKED" | "NOT_READY" | "UNSUPPORTED" | "CONFLICT"; operation?: ITerminationProviderOperation }> {
    const session = await mongoose.startSession();
    try {
      let result: { status: "MARKED" | "NOT_READY" | "UNSUPPORTED" | "CONFLICT"; operation?: ITerminationProviderOperation } = { status: "NOT_READY" };
      await session.withTransaction(async () => {
        const op = await TerminationProviderOperation.findById(id).session(session).exec();
        if (!op || op.dispatchMode !== "DISPOSITION" || op.kind !== "REFUND" || op.status !== "PENDING" || op.attemptedAt) { result = { status: "CONFLICT" }; return; }
        const booking = await Booking.findById(op.bookingId).select("+authoritativeDisposition +terminationClaim").session(session).exec();
        const authority = booking?.authoritativeDisposition;
        if (!booking || !authority || authority.authorityId !== authorityId || authority.status !== "CALCULATED" || authority.executionStatus !== "NOT_EXECUTED" || authority.version !== "CANCELLATION_DISPOSITION_V1" || authority.policyVersion !== FINANCIAL_POLICY_VERSION || authority.calculationVersion !== CANCELLATION_CALCULATION_VERSION || !authority.breakdown || dispositionAuthorityFingerprint(authority) !== authorityId) { result = { status: "NOT_READY" }; return; }
        const payment = await Payment.findById(op.paymentId).session(session).exec();
        if (authority.operationKey !== op.claimKey || authority.intent !== op.intent || authority.actorType !== op.actorType || String(authority.actorId ?? "") !== String(op.actorId ?? "") || !booking.paymentId?.equals(op.paymentId) || authority.currency !== op.currency || authority.breakdown.totalCustomerRefund !== op.amount || op.idempotencyKey !== `${op.claimKey}:disposition:${authorityId}` || !payment || payment.status !== PaymentStatus.CAPTURED || payment.method === PaymentMethod.WALLET || payment.method !== booking.paymentMethod || !payment.bookingId.equals(op.bookingId) || !payment.userId.equals(booking.userId) || !payment.creatorId.equals(booking.creatorId) || payment.provider !== op.provider || payment.providerPaymentId !== op.providerPaymentId || payment.amount !== authority.originalChargeTotal || payment.currency !== op.currency || authority.originalChargeTotal !== authority.breakdown.totalCustomerRefund + authority.breakdown.creatorEntitlement + authority.breakdown.sthnEntitlement) { result = { status: "CONFLICT" }; return; }
        const provider = paymentProviderRegistry.has(op.provider) ? paymentProviderRegistry.get(op.provider) : undefined;
        const capability = provider?.dispositionRefundCapabilities;
        if (!capability?.idempotent || !capability.authenticatedLookup || !provider?.getTerminationEvidence || (op.amount < authority.originalChargeTotal ? !capability.partialRefund : !capability.fullRefund)) { result = { status: "UNSUPPORTED" }; return; }
        const paymentFence = await Payment.updateOne({ _id: op.paymentId, status: PaymentStatus.CAPTURED, method: booking.paymentMethod, bookingId: op.bookingId, userId: booking.userId, creatorId: booking.creatorId, provider: op.provider, providerPaymentId: op.providerPaymentId, amount: authority.originalChargeTotal, currency: op.currency }, { $inc: { dispositionDispatchFence: 1 } }, { session });
        if (paymentFence.modifiedCount !== 1) { result = { status: "CONFLICT" }; return; }
        const fenced = await Booking.updateOne({ _id: op.bookingId, paymentId: op.paymentId,
          "terminationClaim.status": "ACTIVE", "terminationClaim.operationKey": op.claimKey, "terminationClaim.intent": op.intent,
          "terminationClaim.actorType": op.actorType, "terminationClaim.actorId": op.actorId ?? { $exists: false }, "terminationClaim.paymentId": op.paymentId,
          "authoritativeDisposition.authorityId": authorityId, "authoritativeDisposition.guardVersion": authority.guardVersion,
          "authoritativeDisposition.breakdown.totalCustomerRefund": op.amount, "authoritativeDisposition.currency": op.currency,
        }, { $inc: { "authoritativeDisposition.guardVersion": 1 } }, { session });
        if (fenced.modifiedCount !== 1) { result = { status: "CONFLICT" }; return; }
        const marked = await TerminationProviderOperation.findOneAndUpdate({ _id: id, dispatchMode: "DISPOSITION", status: "PENDING", attemptedAt: { $exists: false }, amount: op.amount, currency: op.currency, claimKey: op.claimKey, paymentId: op.paymentId, idempotencyKey: op.idempotencyKey }, { $set: { status: "IN_FLIGHT", attemptedAt: new Date() } }, { new: true, session, runValidators: true }).exec();
        if (!marked) throw new Error("Disposition dispatch marker conflicted");
        result = { status: "MARKED", operation: marked };
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      return result;
    } catch { return { status: "NOT_READY" }; }
    finally { await session.endSession(); }
  }

  markUnknown(id: Types.ObjectId) {
    return TerminationProviderOperation.findOneAndUpdate(
      { _id: id, status: "IN_FLIGHT" }, { $set: { status: "UNKNOWN" } },
      { new: true, runValidators: true, writeConcern: { w: "majority" } },
    ).exec();
  }

  /** Caller must first verify provider identity, status, amount, and currency. */
  recordVerifiedOutcome(input: { id: Types.ObjectId; expected: "IN_FLIGHT" | "UNKNOWN"; result: "CONFIRMED" | "FAILED"; providerStatus: string; providerOperationReference?: string }) {
    return TerminationProviderOperation.findOneAndUpdate(
      { _id: input.id, status: input.expected },
      { $set: { status: input.result, providerStatus: input.providerStatus, resolvedAt: new Date(), ...(input.providerOperationReference ? { providerOperationReference: input.providerOperationReference } : {}) } },
      { new: true, runValidators: true, writeConcern: { w: "majority" } },
    ).exec();
  }

  /** Must be called within the transaction that finalizes the matching booking. */
  async finalize(id: Types.ObjectId, session: ClientSession) {
    if (!session.inTransaction()) throw new Error("Finalization requires an active transaction.");
    const operation = await TerminationProviderOperation.findOne({ _id: id, status: "CONFIRMED" }).session(session).exec();
    if (!operation) return null;
    const booking = await Booking.exists({ _id: operation.bookingId, paymentId: operation.paymentId,
      status: { $in: ["CANCELLED", "REJECTED", "EXPIRED"] }, terminationOperationKey: operation.claimKey,
      terminationType: operation.intent, terminatedByType: operation.actorType,
      terminatedById: operation.actorId ?? { $exists: false },
      "terminationClaim.status": "FINALIZED", "terminationClaim.operationKey": operation.claimKey,
      "terminationClaim.intent": operation.intent, "terminationClaim.actorType": operation.actorType,
      "terminationClaim.actorId": operation.actorId ?? { $exists: false },
      "terminationClaim.paymentId": operation.paymentId,
    }).session(session);
    if (!booking) return null;
    return TerminationProviderOperation.findOneAndUpdate(
      { _id: id, status: "CONFIRMED" as TerminationProviderOperationStatus },
      { $set: { status: "FINALIZED", finalizedAt: new Date() } },
      { new: true, runValidators: true, session },
    ).exec();
  }
}

export const terminationProviderOperationRepository = new TerminationProviderOperationRepository();
