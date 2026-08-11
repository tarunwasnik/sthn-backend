// backend/src/services/financial/providers/internal.provider.ts

import crypto from "crypto";
import { Types } from "mongoose";

import { PaymentProviderInterface } from "../../../contracts/financial/paymentProvider.interface";

import {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  CancelPaymentRequest,
  CancelPaymentResponse,
  CreateRefundRequest,
  CreateRefundResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from "../../../contracts/financial/paymentProvider.types";

import { PaymentProvider } from "../../../enums/financial/paymentProvider.enum";

import {
  ProviderSimulationMode,
  ProviderStatus,
} from "../../../constants/internalProvider";

import ProviderPaymentService from "../../internalProvider/payments/providerPayment.service";
import ProviderRefundService from "../../internalProvider/refunds/providerRefund.service";
import ProviderWebhookService from "../../internalProvider/webhooks/providerWebhook.service";
import { ProviderSimulatorError } from "../../../errors/internalProvider/ProviderSimulatorError";

export class InternalPaymentProvider implements PaymentProviderInterface {
  public readonly provider = PaymentProvider.INTERNAL;

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private generateId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }

  private generatePaymentId(): string {
    return this.generateId("INT_PAY");
  }

  private generateTransactionId(): string {
    return this.generateId("INT_TXN");
  }

  private generateRefundId(): string {
    return this.generateId("INT_REFUND");
  }

  private generateWebhookId(): string {
    return this.generateId("INT_WEBHOOK");
  }

  private generateEventId(): string {
    return this.generateId("INT_EVENT");
  }

  private buildProviderMetadata() {
    return {
      provider: PaymentProvider.INTERNAL,
      environment: process.env.NODE_ENV ?? "development",
      simulationMode: ProviderSimulationMode.NORMAL,
    };
  }

  private buildExecutionInfo() {
    return {
      attemptNumber: 1,
      retryCount: 0,
      processingLatencyMs: 0,
      isTestMode: process.env.NODE_ENV !== "production",
    };
  }

  private buildAuditInfo() {
    return {
      createdBy: "InternalPaymentProvider",
      updatedBy: "InternalPaymentProvider",
      lastStatusChangedAt: new Date(),
    };
  }

  private buildPayloads(request: unknown, response: unknown = {}) {
    return {
      request,
      response,
    };
  }

  /**
   * Persist only non-sensitive, provider-relevant session identity. Financial
   * details remain owned by the Financial Domain Payment.
   */
  private buildPaymentSessionPayloads(request: CreatePaymentSessionRequest) {
    return this.buildPayloads({
      paymentId: request.paymentId,
      paymentReference: request.paymentReference,
      bookingId: request.bookingId,
      userId: request.userId,
      creatorId: request.creatorId,
      amount: request.amount,
      provider: request.provider,
      method: request.method,
      idempotencyKey: request.idempotencyKey,
    });
  }

  private getPaymentSessionFingerprint(
    request: CreatePaymentSessionRequest,
  ): string {
    const identity = JSON.stringify({
      paymentId: request.paymentId,
      paymentReference: request.paymentReference,
      bookingId: request.bookingId,
      userId: request.userId,
      creatorId: request.creatorId,
      amount: { amount: request.amount.amount, currency: request.amount.currency },
      provider: request.provider,
      method: request.method,
    });

    return crypto.createHash("sha256").update(identity).digest("hex");
  }

  private getRefundFingerprint(request: CreateRefundRequest, financialPaymentId: string): string {
    return crypto.createHash("sha256").update(JSON.stringify({
      refundId: request.refundId,
      bookingId: request.bookingId,
      financialPaymentId,
      refundReference: request.refundReference,
      paymentReference: request.paymentReference,
      providerPaymentId: request.providerPaymentId,
      amount: request.amount,
      reason: request.reason ?? null,
      provider: PaymentProvider.INTERNAL,
    })).digest("hex");
  }

  private assertEquivalentCreationReplay(
    existingFingerprint: string | undefined,
    requestFingerprint: string,
  ): void {
    if (!existingFingerprint) {
      throw new ProviderSimulatorError(
        "Existing provider payment cannot prove creation replay equivalence.",
        "PROVIDER_PAYMENT_REPLAY_CONFLICT",
        409,
      );
    }

    const existing = Buffer.from(existingFingerprint, "hex");
    const incoming = Buffer.from(requestFingerprint, "hex");
    if (
      existing.length !== incoming.length ||
      !crypto.timingSafeEqual(existing, incoming)
    ) {
      throw new ProviderSimulatorError(
        "Idempotency key is already associated with a different payment-session request.",
        "PROVIDER_PAYMENT_REPLAY_CONFLICT",
        409,
      );
    }
  }

  private buildPaymentSessionResponse(
    providerPaymentId: string,
    providerOrderId?: string,
    duplicateRequest = false,
  ): CreatePaymentSessionResponse {
    return {
      providerPaymentId,
      providerOrderId: providerOrderId ?? "",
      checkoutUrl: `internal://payments/${providerPaymentId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      payload: duplicateRequest
        ? { provider: PaymentProvider.INTERNAL, duplicateRequest: true }
        : { provider: PaymentProvider.INTERNAL, status: ProviderStatus.CREATED },
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null &&
      "code" in error && (error as { code?: unknown }).code === 11000;
  }
  /* -------------------------------------------------------------------------- */
  /* Payment Session                                                             */
  /* -------------------------------------------------------------------------- */

  async createPaymentSession(
    request: CreatePaymentSessionRequest,
  ): Promise<CreatePaymentSessionResponse> {
    const requestFingerprint = this.getPaymentSessionFingerprint(request);
    const existing = await ProviderPaymentService.findByIdempotencyKeyForReplay(
      request.idempotencyKey,
    );

    if (existing) {
      this.assertEquivalentCreationReplay(
        existing.requestFingerprint,
        requestFingerprint,
      );
      return this.buildPaymentSessionResponse(
        existing.providerPaymentId,
        existing.providerReference ?? undefined,
        true,
      );
    }

    const providerPaymentId = this.generatePaymentId();

    const providerOrderId = this.generateId("INT_ORDER");

    try {
      await ProviderPaymentService.createPayment({
        paymentId: new Types.ObjectId(request.paymentId),
        amount: request.amount.amount,
        currency: request.amount.currency,
        providerPaymentId,
        providerReference: providerOrderId,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint,
        providerMetadata: this.buildProviderMetadata(),
        execution: this.buildExecutionInfo(),
        audit: this.buildAuditInfo(),
        payloads: this.buildPaymentSessionPayloads(request),
      });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;

      const raced = await ProviderPaymentService.findByIdempotencyKeyForReplay(
        request.idempotencyKey,
      );
      if (!raced) throw error;

      this.assertEquivalentCreationReplay(
        raced.requestFingerprint,
        requestFingerprint,
      );
      return this.buildPaymentSessionResponse(
        raced.providerPaymentId,
        raced.providerReference ?? undefined,
        true,
      );
    }

    return this.buildPaymentSessionResponse(providerPaymentId, providerOrderId);
  }
  /* -------------------------------------------------------------------------- */
  /* Verification                                                                */
  /* -------------------------------------------------------------------------- */

  async verifyPayment(
    request: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    const payment = await ProviderPaymentService.findByProviderPaymentId(
      request.providerPaymentId,
    );

    if (!payment) {
      return {
        verified: false,

        providerStatus: "NOT_FOUND",
      };
    }

    let updated = payment;
    if (updated.status === ProviderStatus.CREATED) {
      updated = await ProviderPaymentService.authorizePayment(
        updated._id,
        updated.providerTransactionId ?? this.generateTransactionId(),
      );
    }

    if (
      updated.status === ProviderStatus.AUTHORIZED ||
      updated.status === ProviderStatus.PARTIALLY_CAPTURED
    ) {
      updated = await ProviderPaymentService.capturePayment(updated._id);
    }

    return {
      verified: updated.status === ProviderStatus.CAPTURED,

      providerTransactionId: updated.providerTransactionId,

      providerStatus: updated.status,

      payload: {
        providerPaymentId: updated.providerPaymentId,

        paymentId: updated.paymentId.toString(),

        verifiedAt: new Date(),

        provider: PaymentProvider.INTERNAL,
      },
    };
  }
  /* -------------------------------------------------------------------------- */
  /* Payment Status                                                              */
  /* -------------------------------------------------------------------------- */

  async getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<GetPaymentStatusResponse> {
    const payment = await ProviderPaymentService.findByProviderPaymentId(
      request.providerPaymentId,
    );

    if (!payment) {
      throw new Error("Provider payment not found.");
    }

    return {
      providerPaymentId: payment.providerPaymentId,

      providerTransactionId: payment.providerTransactionId,

      providerStatus: payment.status,

      payload: {
        paymentId: payment.paymentId.toString(),

        providerReference: payment.providerReference,

        createdAt: payment.createdAt,

        updatedAt: payment.updatedAt,
      },
    };
  }
  /* -------------------------------------------------------------------------- */
  /* Cancellation / authorization void                                          */
  /* -------------------------------------------------------------------------- */
  async cancelPayment(request: CancelPaymentRequest): Promise<CancelPaymentResponse> {
    const payment = await ProviderPaymentService.findByProviderPaymentId(request.providerPaymentId);
    if (!payment) throw new ProviderSimulatorError("Provider payment not found.", "PROVIDER_PAYMENT_NOT_FOUND", 404);
    const cancelled = payment.status === ProviderStatus.CANCELLED
      ? payment
      : await ProviderPaymentService.cancelPayment(payment._id);
    return {
      providerPaymentId: cancelled.providerPaymentId,
      providerStatus: cancelled.status,
      payload: { paymentId: cancelled.paymentId.toString(), provider: PaymentProvider.INTERNAL, cancelledAt: cancelled.cancelledAt ?? new Date() },
    };
  }
  /* -------------------------------------------------------------------------- */
  /* Refund                                                                      */
  /* -------------------------------------------------------------------------- */

  async createRefund(
    request: CreateRefundRequest,
  ): Promise<CreateRefundResponse> {
    const payment = await ProviderPaymentService.findByProviderPaymentId(
      request.providerPaymentId,
    );

    if (!payment) {
      throw new Error("Provider payment not found.");
    }

    if (!payment.providerTransactionId || payment.status !== ProviderStatus.CAPTURED) {
      throw new Error(
        "Cannot refund a provider payment that is not captured.",
      );
    }

    if (request.amount.amount !== payment.amount || request.amount.currency !== payment.currency) {
      throw new ProviderSimulatorError("Provider refund must equal the captured payment amount.", "PROVIDER_REFUND_AMOUNT_MISMATCH", 409);
    }

    const requestFingerprint = this.getRefundFingerprint(request, payment.paymentId.toString());
    const existing = await ProviderRefundService.findByIdempotencyKeyForReplay(request.idempotencyKey);
    if (existing) {
      this.assertEquivalentCreationReplay(existing.requestFingerprint, requestFingerprint);
      if (existing.providerPaymentId !== request.providerPaymentId || existing.amount !== request.amount.amount || existing.currency !== request.amount.currency) {
        throw new ProviderSimulatorError("Provider refund idempotency key conflicts with the refund identity.", "PROVIDER_REFUND_REPLAY_CONFLICT", 409);
      }
      if (existing.status === "CREATED") await ProviderRefundService.processRefund(existing._id);
      if (existing.status === "CREATED" || existing.status === "PROCESSING") await ProviderRefundService.completeRefund(existing._id);
      const replayed = await ProviderRefundService.findById(existing._id);
      if (!replayed || replayed.status !== "REFUNDED") throw new ProviderSimulatorError("Provider refund is not complete.", "PROVIDER_REFUND_INCOMPLETE", 409);
      return { providerRefundId: replayed.providerRefundId, providerStatus: replayed.status, payload: { provider: PaymentProvider.INTERNAL, providerPaymentId: payment.providerPaymentId, providerTransactionId: payment.providerTransactionId, refundedAt: replayed.completedAt ?? new Date() } };
    }

    const providerRefundId = this.generateRefundId();

    let createdRefund;
    try {
      createdRefund = await ProviderRefundService.createRefund({ refundId: new Types.ObjectId(request.refundId), internalPaymentId: payment._id, providerPaymentId: payment.providerPaymentId, providerRefundId, idempotencyKey: request.idempotencyKey, requestFingerprint, amount: request.amount.amount, currency: request.amount.currency, providerMetadata: this.buildProviderMetadata(), execution: this.buildExecutionInfo(), audit: this.buildAuditInfo(), payloads: this.buildPayloads(request) });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const raced = await ProviderRefundService.findByIdempotencyKeyForReplay(request.idempotencyKey);
      if (!raced) throw error;
      this.assertEquivalentCreationReplay(raced.requestFingerprint, requestFingerprint);
      if (raced.providerPaymentId !== request.providerPaymentId || raced.amount !== request.amount.amount || raced.currency !== request.amount.currency) throw new ProviderSimulatorError("Provider refund replay conflicts with persisted identity.", "PROVIDER_REFUND_REPLAY_CONFLICT", 409);
      if (raced.status === "CREATED") await ProviderRefundService.processRefund(raced._id);
      if (raced.status === "CREATED" || raced.status === "PROCESSING") await ProviderRefundService.completeRefund(raced._id);
      return { providerRefundId: raced.providerRefundId, providerStatus: "REFUNDED", payload: { provider: PaymentProvider.INTERNAL, providerPaymentId: payment.providerPaymentId, providerTransactionId: payment.providerTransactionId, refundedAt: raced.completedAt ?? new Date() } };
    }

    await ProviderRefundService.processRefund(createdRefund._id);

    await ProviderRefundService.completeRefund(createdRefund._id);

    const refund =
      await ProviderRefundService.findByProviderRefundId(providerRefundId);

    if (!refund) {
      throw new Error("Failed to create provider refund.");
    }

    return {
      providerRefundId,

      providerStatus: refund.status,

      payload: {
        provider: PaymentProvider.INTERNAL,

        providerPaymentId: payment.providerPaymentId,

        providerTransactionId: payment.providerTransactionId,

        refundedAt: new Date(),
      },
    };
  }
  /* -------------------------------------------------------------------------- */
  /* Webhooks                                                                    */
  /* -------------------------------------------------------------------------- */

  async verifyWebhook(
    request: VerifyWebhookRequest,
  ): Promise<VerifyWebhookResponse> {
    const providerWebhookId = this.generateWebhookId();

    const eventId = this.generateEventId();

    await ProviderWebhookService.createWebhook({
      providerWebhookId,

      providerEntityId: eventId,

      eventName:
        ((request.body as Record<string, unknown>)?.eventType as string) ??
        "internal.webhook",

      idempotencyKey: providerWebhookId,

      providerMetadata: this.buildProviderMetadata(),

      execution: this.buildExecutionInfo(),

      audit: this.buildAuditInfo(),

      payloads: {
        request: request.body,
        response: {},
      },
    });

    await ProviderWebhookService.receiveWebhook(providerWebhookId);

    await ProviderWebhookService.validateWebhook(providerWebhookId);

    await ProviderWebhookService.verifyWebhook(providerWebhookId);

    await ProviderWebhookService.processWebhook(providerWebhookId);

    await ProviderWebhookService.completeWebhook(providerWebhookId);

    const webhook =
      await ProviderWebhookService.getWebhookByProviderWebhookId(
        providerWebhookId,
      );

    if (!webhook) {
      return {
        verified: false,

        providerEventId: eventId,

        providerEventType: "NOT_FOUND",

        payload: {},
      };
    }

    return {
      verified: true,

      providerEventId: webhook.providerEntityId ?? eventId,

      providerEventType: webhook.eventName,

      payload: {
        provider: PaymentProvider.INTERNAL,
        processedAt: new Date(),
      },
    };
  }
}

export const internalPaymentProvider = new InternalPaymentProvider();

export default internalPaymentProvider;
