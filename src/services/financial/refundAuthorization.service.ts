import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { SupportedCurrency, SUPPORTED_CURRENCIES } from "../../constants/financial/supportedCurrencies";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { RefundStatus } from "../../enums/financial/refundStatus.enum";
import { RefundReason } from "../../enums/financial/refundReason.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { refundAuthorizationRepository as repository } from "../../repositories/refundAuthorization.repository";
import { generateFinancialReference } from "../../utils/financial/reference.util";

export interface AuthorizedRefundDecision {
  authority: string; decisionId: string; policyVersion: string;
  bookingId: Types.ObjectId; paymentId: Types.ObjectId; customerId: Types.ObjectId; creatorId: Types.ObjectId;
  provider: PaymentProvider; providerPaymentId: string; currency: SupportedCurrency; amount: number;
  reason: RefundReason; terminationOperationId?: Types.ObjectId;
}
/** Must read durable approval and fence conflicting booking/payment decision changes in this transaction. */
export interface AuthorizedRefundDecisionReader { readAuthorized(authority: string, decisionId: string, session: ClientSession): Promise<AuthorizedRefundDecision | null>; }
export interface RefundCapabilityReader { capabilities(provider: PaymentProvider): { fullRefund: boolean; partialRefund: boolean; idempotent: boolean; authenticatedLookup: boolean } | null; }
export class RefundAuthorizationError extends Error { constructor(message: string, readonly code: "INVALID" | "NOT_AUTHORIZED" | "CONFLICT" | "INTEGRITY" | "UNSUPPORTED") { super(message); } }
const bounded = (s: string) => typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 200;
const fingerprint = (d: AuthorizedRefundDecision) => crypto.createHash("sha256").update(JSON.stringify([d.authority, d.decisionId, d.policyVersion, String(d.bookingId), String(d.paymentId), String(d.customerId), String(d.creatorId), d.provider, d.providerPaymentId, d.currency, d.amount, d.reason, String(d.terminationOperationId ?? "")])).digest("hex");
const operationKey = (authority: string, decisionId: string) => `refund-authorization:${crypto.createHash("sha256").update(`${authority}:${decisionId}`).digest("hex")}`;

export class RefundAuthorizationService {
  constructor(private readonly decisions: AuthorizedRefundDecisionReader, private readonly capabilityReader: RefundCapabilityReader) {}
  async authorize(input: { authority: string; decisionId: string }): Promise<{ authorizationId: string; refundId: string; state: "AUTHORIZED"; replayed: boolean }> {
    if (!bounded(input.authority) || !bounded(input.decisionId)) throw new RefundAuthorizationError("Invalid decision identity.", "INVALID");
    const session = await mongoose.startSession(); let outcome: { authorizationId: string; refundId: string; state: "AUTHORIZED"; replayed: boolean } | undefined;
    try {
      await session.withTransaction(async () => {
        const decision = await this.decisions.readAuthorized(input.authority, input.decisionId, session);
        if (!decision || decision.authority !== input.authority || decision.decisionId !== input.decisionId) throw new RefundAuthorizationError("Refund is not authorized.", "NOT_AUTHORIZED");
        if (!bounded(decision.policyVersion) || !SUPPORTED_CURRENCIES.includes(decision.currency) || !Number.isSafeInteger(decision.amount) || decision.amount <= 0 || !Types.ObjectId.isValid(decision.bookingId) || !Types.ObjectId.isValid(decision.paymentId) || !Types.ObjectId.isValid(decision.customerId) || !Types.ObjectId.isValid(decision.creatorId) || !decision.providerPaymentId || !Object.values(RefundReason).includes(decision.reason)) throw new RefundAuthorizationError("Refund decision is invalid.", "INVALID");
        const key = fingerprint(decision); const existing = await repository.findByDecision(input.authority, input.decisionId, session);
        if (existing) {
          if (existing.fingerprint !== key) throw new RefundAuthorizationError("Refund decision identity conflicts.", "CONFLICT");
          outcome = { authorizationId: String(existing._id), refundId: String(existing.refundId), state: "AUTHORIZED", replayed: true }; return;
        }
        const capability = this.capabilityReader.capabilities(decision.provider);
        if (!capability?.idempotent || !capability.authenticatedLookup) throw new RefundAuthorizationError("Refund provider capabilities are unavailable.", "UNSUPPORTED");
        const [booking, payment, operation] = await repository.findGraph(decision.bookingId, decision.paymentId, session);
        if (!booking || !payment || !operation || !booking.paymentId?.equals(payment._id) || !payment.bookingId.equals(booking._id) || !booking.userId.equals(decision.customerId) || !booking.creatorId.equals(decision.creatorId) || !payment.userId.equals(decision.customerId) || !payment.creatorId.equals(decision.creatorId) || payment.method === PaymentMethod.WALLET || booking.paymentMethod !== payment.method || payment.status !== PaymentStatus.CAPTURED || payment.provider !== decision.provider || payment.providerPaymentId !== decision.providerPaymentId || payment.currency !== decision.currency || booking.currency !== decision.currency || payment.amount !== booking.totalAmount || !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) || !operation.userId.equals(booking.userId) || operation.status !== PaymentOperationStatus.CONFIRMED || operation.providerStatus !== "CAPTURED" || !operation.confirmedAt || operation.provider !== payment.provider || operation.providerPaymentId !== payment.providerPaymentId || operation.requestedAmount !== payment.amount || operation.verifiedAmount !== payment.amount || operation.requestedCurrency !== payment.currency || operation.verifiedCurrency !== payment.currency) throw new RefundAuthorizationError("Booking and confirmed payment evidence do not reconcile.", "INTEGRITY");
        if ((decision.amount === payment.amount && !capability.fullRefund) || (decision.amount < payment.amount && !capability.partialRefund)) throw new RefundAuthorizationError("Provider does not support the requested refund amount.", "UNSUPPORTED");
        const active = await repository.activeRefundTotal(payment._id, session); const used = active[0]?.amount ?? 0;
        if (!Number.isSafeInteger(used) || used + decision.amount > payment.amount) throw new RefundAuthorizationError("Refund exceeds available captured amount.", "CONFLICT");
        // Forces transaction serialization with another refund authorization for this payment.
        const fenced = await repository.fencePayment(payment._id, booking._id as Types.ObjectId, payment.providerPaymentId, payment.amount, payment.currency, session);
        if (fenced.modifiedCount !== 1) throw new RefundAuthorizationError("Payment refund authorization fence conflicts.", "CONFLICT");
        let terminationOperationId: Types.ObjectId | undefined;
        if (decision.terminationOperationId) {
          const termination = await repository.findTerminationOperation(decision.terminationOperationId, session);
          if (!termination || termination.kind !== "REFUND" || !termination.bookingId.equals(booking._id) || !termination.paymentId.equals(payment._id) || termination.provider !== payment.provider || termination.providerPaymentId !== payment.providerPaymentId || termination.amount !== decision.amount || termination.currency !== payment.currency || termination.status === "FINALIZED") throw new RefundAuthorizationError("Termination refund operation identity conflicts.", "CONFLICT");
          terminationOperationId = termination._id as Types.ObjectId;
        }
        const refund = await repository.createRefund({ refundReference: generateFinancialReference("REFUND"), paymentId: payment._id, bookingId: booking._id, userId: booking.userId, creatorId: booking.creatorId, amount: decision.amount, currency: decision.currency, status: RefundStatus.APPROVED, reason: decision.reason, provider: payment.provider, providerPaymentId: payment.providerPaymentId, attemptNumber: 1, retryable: false, idempotencyKey: operationKey(decision.authority, decision.decisionId), attributes: { authorizationOnly: true } }, session);
        const authorization = await repository.createAuthorization({ authority: decision.authority, decisionId: decision.decisionId, fingerprint: key, policyVersion: decision.policyVersion, bookingId: booking._id, paymentId: payment._id, refundId: refund._id, ...(terminationOperationId ? { terminationOperationId } : {}), provider: payment.provider, providerPaymentId: payment.providerPaymentId, amount: decision.amount, currency: decision.currency, state: "AUTHORIZED" }, session);
        outcome = { authorizationId: String(authorization._id), refundId: String(refund._id), state: "AUTHORIZED", replayed: false };
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const winner = await repository.findByDecision(input.authority, input.decisionId);
        if (!winner) throw new RefundAuthorizationError("Refund operation conflicts with another authorization.", "CONFLICT");
        return this.authorize(input);
      }
      throw error;
    } finally { await session.endSession(); }
    if (!outcome) throw new RefundAuthorizationError("Refund authorization did not commit.", "INTEGRITY");
    return outcome;
  }
}
