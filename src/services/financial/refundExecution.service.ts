import mongoose, { Types } from "mongoose";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { RefundStatus } from "../../enums/financial/refundStatus.enum";
import { IRefund } from "../../models/refund.model";
import { RefundAuthorization } from "../../models/refundAuthorization.model";
import { Refund } from "../../models/refund.model";
import { refundAuthorizationRepository as repository } from "../../repositories/refundAuthorization.repository";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";
import { PaymentProviderInterface } from "../../contracts/financial/paymentProvider.interface";

export class RefundExecutionError extends Error {
  constructor(message: string, readonly code: "INVALID" | "BLOCKED" | "CONFLICT" | "UNKNOWN") { super(message); }
}

type ExecutionResult = { refundId: string; state: RefundStatus; replayed: boolean };

/**
 * Opt-in execution boundary for a previously authorized Refund. It never selects
 * a new provider, recalculates an allocation, or retries an uncertain dispatch.
 */
export class RefundExecutionService {
  constructor(private readonly providerFor: (provider: import("../../enums/financial/paymentProvider.enum").PaymentProvider) => PaymentProviderInterface | undefined = (provider) => paymentProviderRegistry.has(provider) ? paymentProviderRegistry.get(provider) : undefined) {}

  async execute(refundId: string): Promise<ExecutionResult> {
    if (!Types.ObjectId.isValid(refundId)) throw new RefundExecutionError("Invalid refund identity.", "INVALID");
    const id = new Types.ObjectId(refundId);
    const session = await mongoose.startSession();
    let claimed: { refund: IRefund; paymentReference: string } | null = null;
    try {
      await session.withTransaction(async () => {
        const [authorization, refund] = await Promise.all([repository.findByRefundId(id, session), Refund.findById(id).session(session).exec()]);
        if (!authorization || !refund || authorization.state !== "AUTHORIZED" || !authorization.refundId.equals(refund._id)) throw new RefundExecutionError("Refund lacks authoritative authorization.", "BLOCKED");
        // TERMINAL_LATE_CAPTURE_V1 is dispatched and recovered solely by the
        // termination operation. Its authorization record is admission evidence,
        // not a second generic provider-dispatch instruction.
        if (authorization.authority === "TERMINAL_LATE_CAPTURE_V1" || authorization.terminationOperationId) throw new RefundExecutionError("Refund dispatch is owned by the termination recovery operation.", "BLOCKED");
        if (refund.status !== RefundStatus.APPROVED) return;
        const [booking, payment, operation] = await repository.findGraph(authorization.bookingId, authorization.paymentId, session);
        if (!booking || !payment || !operation || refund.paymentId.toString() !== String(payment._id) || refund.bookingId.toString() !== String(booking._id) || refund.userId.toString() !== String(booking.userId) || refund.creatorId.toString() !== String(booking.creatorId) || refund.provider !== authorization.provider || refund.providerPaymentId !== authorization.providerPaymentId || refund.amount !== authorization.amount || refund.currency !== authorization.currency || payment.status !== PaymentStatus.CAPTURED || payment.method === PaymentMethod.WALLET || payment.provider !== authorization.provider || payment.providerPaymentId !== authorization.providerPaymentId || payment.amount < refund.amount || payment.currency !== refund.currency || !booking.paymentId?.equals(payment._id) || !operation.paymentId.equals(payment._id) || operation.status !== "CONFIRMED" || operation.providerPaymentId !== payment.providerPaymentId) throw new RefundExecutionError("Refund execution evidence does not reconcile.", "BLOCKED");
        const provider = this.providerFor(payment.provider);
        const capability = provider?.dispositionRefundCapabilities;
        if (!provider || !capability?.idempotent || !capability.authenticatedLookup || !provider.getTerminationEvidence || (refund.amount === payment.amount ? !capability.fullRefund : !capability.partialRefund)) throw new RefundExecutionError("Original collection provider cannot execute this refund safely.", "BLOCKED");
        const dispatch = await repository.claimRefundDispatch(id, session);
        if (!dispatch) throw new RefundExecutionError("Refund dispatch was claimed concurrently.", "CONFLICT");
        claimed = { refund: dispatch, paymentReference: payment.paymentReference };
      });
    } finally { await session.endSession(); }
    const committedClaim = claimed as { refund: IRefund; paymentReference: string } | null;
    if (!committedClaim) {
      const current = await Refund.findById(id).orFail();
      return { refundId, state: current.status, replayed: current.status === RefundStatus.COMPLETED };
    }
    const provider = this.providerFor(committedClaim.refund.provider);
    if (!provider) throw new RefundExecutionError("Original collection provider is unavailable.", "BLOCKED");
    try {
      const result = await provider.createRefund({ refundId, bookingId: String(committedClaim.refund.bookingId), refundReference: committedClaim.refund.refundReference, paymentReference: committedClaim.paymentReference, providerPaymentId: committedClaim.refund.providerPaymentId!, amount: { amount: committedClaim.refund.amount, currency: committedClaim.refund.currency }, reason: committedClaim.refund.reason, idempotencyKey: committedClaim.refund.idempotencyKey });
      if (!result.providerRefundId) throw new RefundExecutionError("Provider refund identity is missing.", "UNKNOWN");
      // Provider acceptance is not completion evidence. Persist the immutable provider
      // reference first, then require the adapter's authenticated read path below.
      const updated = await repository.recordRefundProviderResult(id, [RefundStatus.PROCESSING], { status: RefundStatus.PENDING, providerRefundId: result.providerRefundId, providerPayload: result.payload ?? {} });
      if (!updated) throw new RefundExecutionError("Refund result persistence conflicted.", "UNKNOWN");
      return this.reconcile(refundId);
    } catch (error) {
      if (error instanceof RefundExecutionError && error.code !== "UNKNOWN") throw error;
      await repository.recordRefundProviderResult(id, [RefundStatus.PROCESSING], { status: RefundStatus.UNKNOWN, failureMessage: "Provider refund outcome requires reconciliation." });
      throw error instanceof RefundExecutionError ? error : new RefundExecutionError("Provider refund outcome is unknown.", "UNKNOWN");
    }
  }

  /** Read-only provider reconciliation. An UNKNOWN operation without a provider
   * refund reference remains blocked rather than being redispatched. */
  async reconcile(refundId: string): Promise<ExecutionResult> {
    if (!Types.ObjectId.isValid(refundId)) throw new RefundExecutionError("Invalid refund identity.", "INVALID");
    const refund = await Refund.findById(refundId).exec();
    const authorization = refund ? await repository.findByRefundId(refund._id as Types.ObjectId) : null;
    if (!refund || !authorization || authorization.state !== "AUTHORIZED" || !authorization.refundId.equals(refund._id)) throw new RefundExecutionError("Refund lacks authoritative authorization.", "BLOCKED");
    if (refund.status === RefundStatus.COMPLETED) return { refundId, state: refund.status, replayed: true };
    if (![RefundStatus.PROCESSING, RefundStatus.PENDING, RefundStatus.UNKNOWN].includes(refund.status)) throw new RefundExecutionError("Refund is not awaiting provider reconciliation.", "CONFLICT");
    if (!refund.providerRefundId) {
      await repository.recordRefundProviderResult(refund._id as Types.ObjectId, [RefundStatus.PROCESSING, RefundStatus.PENDING, RefundStatus.UNKNOWN], { status: RefundStatus.UNKNOWN, failureMessage: "Provider refund reference is unavailable; manual provider reconciliation is required." });
      throw new RefundExecutionError("Refund outcome is unknown without a provider reference; redispatch is blocked.", "UNKNOWN");
    }
    const provider = this.providerFor(refund.provider);
    if (!provider?.getTerminationEvidence) throw new RefundExecutionError("Original provider does not support refund reconciliation.", "BLOCKED");
    let evidence;
    try { evidence = await provider.getTerminationEvidence({ kind: "REFUND", paymentId: String(refund.paymentId), providerPaymentId: refund.providerPaymentId ?? "", amount: { amount: refund.amount, currency: refund.currency }, refundId, providerOperationReference: refund.providerRefundId }); }
    catch { throw new RefundExecutionError("Provider refund outcome remains unknown.", "UNKNOWN"); }
    if (evidence.outcome !== "VERIFIED" || evidence.kind !== "REFUND" || evidence.paymentId !== String(refund.paymentId) || evidence.providerPaymentId !== refund.providerPaymentId || evidence.amount.amount !== refund.amount || evidence.amount.currency !== refund.currency || evidence.refundId !== refundId || evidence.providerOperationReference !== refund.providerRefundId) throw new RefundExecutionError("Provider refund evidence does not reconcile.", "BLOCKED");
    const state = evidence.result === "SUCCESS" ? RefundStatus.COMPLETED : evidence.result === "DEFINITIVE_FAILURE" ? RefundStatus.FAILED : RefundStatus.PENDING;
    const updated = await repository.recordRefundProviderResult(refund._id as Types.ObjectId, [RefundStatus.PROCESSING, RefundStatus.PENDING, RefundStatus.UNKNOWN], { status: state, providerPayload: { ...(refund.providerPayload ?? {}), reconciliationProviderStatus: evidence.providerStatus } });
    if (!updated) throw new RefundExecutionError("Refund reconciliation conflicted.", "CONFLICT");
    return { refundId, state, replayed: false };
  }
}

export const refundExecutionService = new RefundExecutionService();
