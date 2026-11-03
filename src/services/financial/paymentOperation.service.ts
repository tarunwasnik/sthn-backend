import crypto from "crypto";

import { IPayment } from "../../models/payment.model";
import { ClientSession } from "mongoose";
import { IPaymentOperation } from "../../models/paymentOperation.model";
import { paymentOperationRepository, PaymentOperationRepository } from "../../repositories/paymentOperation.repository";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { CreatePaymentSessionResponse, GetPaymentStatusResponse } from "../../contracts/financial/paymentProvider.types";
import { PaymentError } from "../../errors/financial/PaymentError";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { assertFinancialSimulatorAllowed } from "./simulatorAccess.service";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";

const terminalProviderFailures = new Set(["FAILED", "CANCELLED", "EXPIRED"]);

export class PaymentOperationService {
  constructor(private readonly operations: PaymentOperationRepository = paymentOperationRepository) {}

  private reference(payment: IPayment): string {
    return `PAYOP-${crypto.createHash("sha256").update(`${payment._id}:${payment.idempotencyKey}`).digest("hex").slice(0, 20).toUpperCase()}`;
  }
  private event(kind: IPaymentOperation["history"][number]["kind"], note?: string, providerStatus?: string) {
    return { kind, occurredAt: new Date(), note, providerStatus };
  }
  private assertOwnership(operation: IPaymentOperation, payment: IPayment) {
    if (!operation.selectionEvidence || !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(payment.bookingId) || !operation.userId.equals(payment.userId) || operation.provider !== payment.provider || operation.selectionEvidence.provider !== payment.provider || operation.requestedAmount !== payment.amount || operation.requestedCurrency !== payment.currency || operation.idempotencyKey !== payment.idempotencyKey) {
      throw new PaymentError("Payment operation identity conflicts with its Financial Payment.", "PAYMENT_PROVIDER_LINK_CONFLICT");
    }
  }
  private selectionEvidence(payment: IPayment): IPaymentOperation["selectionEvidence"] {
    const profile = paymentProviderRegistry.routingProfile(payment.provider);
    const environment = process.env.NODE_ENV ?? "development";
    if (!profile || !profile.approvedEnvironments.includes(environment) || profile.operations.COLLECTION !== "SUPPORTED") throw new PaymentError("Provider selection evidence is unavailable for payment preparation.", "PAYMENT_PROVIDER_UNAVAILABLE");
    if (profile.simulator && environment === "production") throw new PaymentError("Simulator cannot be a production payment authority.", "PAYMENT_PROVIDER_UNAVAILABLE");
    return { operation: "COLLECTION", provider: payment.provider, configurationVersion: profile.configurationVersion, selectedAt: new Date(), rationale: profile.simulator ? "Development simulator capability profile selected before dispatch." : "Verified provider capability profile selected before dispatch.", simulator: !!profile.simulator };
  }
  async prepare(payment: IPayment, session?: ClientSession): Promise<IPaymentOperation> {
    const existing = await this.operations.findByPaymentId(payment._id.toString(), session);
    if (existing) { this.assertOwnership(existing, payment); return existing; }
    try {
      return await this.operations.create({ operationReference: this.reference(payment), paymentId: payment._id, bookingId: payment.bookingId, userId: payment.userId, provider: payment.provider, selectionEvidence: this.selectionEvidence(payment), idempotencyKey: payment.idempotencyKey, requestedAmount: payment.amount, requestedCurrency: payment.currency, status: PaymentOperationStatus.PENDING, history: [this.event("CREATED")] }, session);
    } catch (error: unknown) {
      const replay = await this.operations.findByPaymentId(payment._id.toString(), session);
      if (!replay) throw error;
      this.assertOwnership(replay, payment);
      return replay;
    }
  }
  async startAttempt(operation: IPaymentOperation) {
    if (operation.status === PaymentOperationStatus.UNKNOWN) throw new PaymentError("Payment operation outcome is unknown and requires reconciliation before another provider attempt.", "PAYMENT_PROVIDER_OUTCOME_UNKNOWN");
    const claimed = await this.operations.claimSessionDispatch(operation, new Date());
    if (!claimed) throw new PaymentError("Payment dispatch already started or requires reconciliation; another provider attempt is not permitted.", "PAYMENT_PROVIDER_OUTCOME_UNKNOWN");
    return claimed;
  }
  async linkProviderSession(operation: IPaymentOperation, response: CreatePaymentSessionResponse) {
    if (operation.providerPaymentId && operation.providerPaymentId !== response.providerPaymentId) return this.conflict(operation, "Provider session response conflicts with the durable operation reference.");
    const providerOrderId = response.providerOrderId || undefined;
    if (operation.providerOrderId && providerOrderId && operation.providerOrderId !== providerOrderId) return this.conflict(operation, "Provider order response conflicts with the durable operation reference.");
    return this.operations.update(operation._id, { providerPaymentId: response.providerPaymentId, providerOrderId, status: PaymentOperationStatus.PENDING }, this.event("PROVIDER_LINKED"));
  }
  async bindRazorpayCapturedPayment(operation: IPaymentOperation, orderId: string, paymentId: string) {
    const authoritative = await this.operations.findById(operation._id);
    if (!authoritative) throw new PaymentError("Payment operation not found.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    if (authoritative.provider !== PaymentProvider.RAZORPAY || authoritative.providerOrderId !== orderId || !paymentId.startsWith("pay_")) return this.conflict(authoritative, "Razorpay confirmation does not match the durable order identity.");
    if (authoritative.providerPaymentId === paymentId) return authoritative;
    if (authoritative.providerPaymentId !== orderId) return this.conflict(authoritative, "Razorpay confirmation conflicts with an existing provider payment identity.");
    const bound = await this.operations.bindRazorpayPayment(operation, orderId, paymentId);
    if (bound) return bound;
    const replay = await this.operations.findById(operation._id);
    if (replay?.provider === PaymentProvider.RAZORPAY && replay.providerOrderId === orderId && replay.providerPaymentId === paymentId) return replay;
    if (!replay) throw new PaymentError("Payment operation not found.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    return this.conflict(replay, "Razorpay confirmation conflicts with an existing provider payment identity.");
  }
  async markUnknown(operation: IPaymentOperation, note: string) {
    if (operation.status === PaymentOperationStatus.CONFIRMED || operation.status === PaymentOperationStatus.FAILED) return this.conflict(operation, "A terminal payment operation cannot become unknown.");
    return this.operations.update(operation._id, { status: PaymentOperationStatus.UNKNOWN, unknownAt: new Date() }, this.event("UNKNOWN", note));
  }
  async reconcile(operation: IPaymentOperation, result: GetPaymentStatusResponse): Promise<IPaymentOperation> {
    if (operation.provider === PaymentProvider.INTERNAL) assertFinancialSimulatorAllowed();
    if (!operation.providerPaymentId || result.providerPaymentId !== operation.providerPaymentId) return this.conflict(operation, "Provider status is not linked to this payment operation.");
    const authoritative = await this.operations.findById(operation._id);
    if (!authoritative) throw new PaymentError("Payment operation not found.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    if (authoritative.providerPaymentId !== result.providerPaymentId) return this.conflict(authoritative, "Provider status is not linked to this payment operation.");
    const base = { providerStatus: result.providerStatus, providerTransactionId: result.providerTransactionId, lastReconciledAt: new Date() };
    if (terminalProviderFailures.has(result.providerStatus)) {
      if (authoritative.status === PaymentOperationStatus.FAILED && authoritative.providerStatus === result.providerStatus) return authoritative;
      if (authoritative.status === PaymentOperationStatus.FAILED) return this.conflict(authoritative, "Provider returned a conflicting failed terminal outcome.");
      if (authoritative.status === PaymentOperationStatus.CONFIRMED) return this.conflict(authoritative, "Provider returned a failed terminal outcome after a confirmed outcome.");
      const transitioned = await this.operations.transitionReconciliation({ operationId: authoritative._id, providerPaymentId: result.providerPaymentId, expectedStatuses: [PaymentOperationStatus.PENDING, PaymentOperationStatus.UNKNOWN], update: { ...base, status: PaymentOperationStatus.FAILED, failedAt: new Date() }, history: this.event("FAILED", undefined, result.providerStatus) });
      if (transitioned) return transitioned;
      return this.reconcile(authoritative, result);
    }
    if (result.providerStatus === "CAPTURED") {
      if (!result.amount || result.amount.amount !== authoritative.requestedAmount || result.amount.currency !== authoritative.requestedCurrency) return this.conflict(authoritative, "Provider-confirmed amount or currency does not match the requested payment.");
      if (authoritative.status === PaymentOperationStatus.CONFIRMED && authoritative.providerStatus === result.providerStatus && authoritative.verifiedAmount === result.amount.amount && authoritative.verifiedCurrency === result.amount.currency) return authoritative;
      if (authoritative.status === PaymentOperationStatus.CONFIRMED) return this.conflict(authoritative, "Provider returned a conflicting successful terminal outcome.");
      if (authoritative.status === PaymentOperationStatus.FAILED) return this.conflict(authoritative, "Provider returned a successful terminal outcome after a failed outcome.");
      const transitioned = await this.operations.transitionReconciliation({ operationId: authoritative._id, providerPaymentId: result.providerPaymentId, expectedStatuses: [PaymentOperationStatus.PENDING, PaymentOperationStatus.UNKNOWN], update: { ...base, status: PaymentOperationStatus.CONFIRMED, confirmedAt: new Date(), verifiedAmount: result.amount.amount, verifiedCurrency: result.amount.currency }, history: this.event("CONFIRMED", undefined, result.providerStatus) });
      if (transitioned) return transitioned;
      return this.reconcile(authoritative, result);
    }
    if (authoritative.status === PaymentOperationStatus.CONFIRMED || authoritative.status === PaymentOperationStatus.FAILED) return this.conflict(authoritative, "Provider returned a non-terminal outcome after a terminal outcome.");
    const transitioned = await this.operations.transitionReconciliation({ operationId: authoritative._id, providerPaymentId: result.providerPaymentId, expectedStatuses: [PaymentOperationStatus.PENDING, PaymentOperationStatus.UNKNOWN], update: { ...base, status: PaymentOperationStatus.PENDING }, history: this.event("RECONCILIATION_ATTEMPT", undefined, result.providerStatus) });
    if (transitioned) return transitioned;
    return this.reconcile(authoritative, result);
  }
  private async conflict(operation: IPaymentOperation, note: string): Promise<never> {
    throw new PaymentError(note, "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
  }
}

export const paymentOperationService = new PaymentOperationService();
