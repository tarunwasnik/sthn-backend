// backend/src/services/payment/provider/paymentProvider.service.ts

import { IPayment } from "../../../models/payment.model";

import { PaymentProvider } from "../../../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";

import { PaymentError } from "../../../errors/financial/PaymentError";

import { PaymentProviderInterface } from "../../../contracts/financial/paymentProvider.interface";

import {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  CreateRefundRequest,
  CreateRefundResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from "../../../contracts/financial/paymentProvider.types";

import { internalPaymentProvider } from "../../financial/providers/internal.provider";

export interface PaymentProviderResult {
  success: boolean;

  status?: PaymentStatus;

  authorizationId?: string;

  providerPaymentId?: string;

  providerOrderId?: string;

  providerTransactionId?: string;

  settlementId?: string;

  providerPayload?: Record<string, unknown>;

  message?: string;
}

export class PaymentProviderService {
  private readonly providers = new Map<
    PaymentProvider,
    PaymentProviderInterface
  >();

  constructor() {
    this.register(internalPaymentProvider);
  }

  register(provider: PaymentProviderInterface): void {
    this.providers.set(provider.provider, provider);
  }

  private resolveProvider(provider: PaymentProvider): PaymentProviderInterface {
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new PaymentError(`Unsupported payment provider "${provider}".`);
    }

    return implementation;
  }

  /* -------------------------------------------------------------------------- */
  /* Provider Lifecycle API                                                     */
  /* -------------------------------------------------------------------------- */

  async createPaymentSession(
    request: CreatePaymentSessionRequest,
  ): Promise<CreatePaymentSessionResponse> {
    return this.resolveProvider(request.provider).createPaymentSession(request);
  }

  async verifyPayment(
    provider: PaymentProvider,
    request: VerifyPaymentRequest,
  ): Promise<VerifyPaymentResponse> {
    return this.resolveProvider(provider).verifyPayment(request);
  }

  async getPaymentStatus(
    provider: PaymentProvider,
    request: GetPaymentStatusRequest,
  ): Promise<GetPaymentStatusResponse> {
    return this.resolveProvider(provider).getPaymentStatus(request);
  }

  async createRefund(
    provider: PaymentProvider,
    request: CreateRefundRequest,
  ): Promise<CreateRefundResponse> {
    return this.resolveProvider(provider).createRefund(request);
  }

  async verifyWebhook(
    provider: PaymentProvider,
    request: VerifyWebhookRequest,
  ): Promise<VerifyWebhookResponse> {
    return this.resolveProvider(provider).verifyWebhook(request);
  }

  /**
   * --------------------------------------------------------------------------
   * High-Level Processing API
   * --------------------------------------------------------------------------
   *
   * Executes the complete provider-side payment lifecycle.
   *
   * PaymentProcessingService depends on this orchestration.
   */
  async process(payment: IPayment): Promise<PaymentProviderResult> {
    const session = await this.createPaymentSession({
      paymentId: payment._id.toString(),
      paymentReference: payment.paymentReference,
      bookingId: payment.bookingId.toString(),
      userId: payment.userId.toString(),
      creatorId: payment.creatorId.toString(),
      amount: {
        amount: payment.amount,
        currency: payment.currency,
      },
      provider: payment.provider,
      method: payment.method,
      idempotencyKey: payment.paymentReference,
    });

    const verification = await this.verifyPayment(payment.provider, {
      providerPaymentId: session.providerPaymentId,
      providerOrderId: session.providerOrderId,
    });

    const status = await this.getPaymentStatus(payment.provider, {
      providerPaymentId: session.providerPaymentId,
    });

    return {
      success: verification.verified,

      status: status.providerStatus as PaymentStatus,

      authorizationId: verification.providerTransactionId,

      providerPaymentId: session.providerPaymentId,

      providerOrderId: session.providerOrderId,

      providerTransactionId: status.providerTransactionId,

      providerPayload: status.payload,

      message: verification.verified
        ? "Payment processed successfully."
        : "Provider verification failed.",
    };
  }
}

export const paymentProviderService = new PaymentProviderService();
