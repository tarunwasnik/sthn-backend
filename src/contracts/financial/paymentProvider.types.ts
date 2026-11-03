// backend/src/contracts/financial/paymentProvider.types.ts

import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { Money } from "../../types/financial/money.type";

/* -------------------------------------------------------------------------- */
/* Shared Types                                                               */
/* -------------------------------------------------------------------------- */

export type ProviderMetadata = Record<string, unknown>;

export type ProviderPayload = Record<string, unknown>;

/**
 * VERIFIED is an adapter assertion backed by authenticated provider evidence,
 * not a caller-supplied status. Statuses are normalized (for example,
 * CANCELLED and REFUNDED). Definitive failure means the adapter can prove the
 * requested mutation did not occur. Unsupported and ambiguous lookups are not
 * evidence of either success or non-mutation.
 */
export interface TerminationEvidenceRequest {
  kind: "PAYMENT" | "CANCEL" | "REFUND";
  paymentId: string;
  providerPaymentId: string;
  amount: Money;
  refundId?: string;
  providerOperationReference?: string;
}

export type TerminationEvidence =
  | { outcome: "UNSUPPORTED" | "UNKNOWN" | "IDENTITY_MISMATCH" }
  | { outcome: "VERIFIED"; kind: TerminationEvidenceRequest["kind"]; paymentId: string;
      providerPaymentId: string; amount: Money; providerStatus: string;
      result: "SUCCESS" | "DEFINITIVE_FAILURE" | "PENDING"; refundId?: string;
      providerOperationReference?: string };

/* -------------------------------------------------------------------------- */
/* Payment Session                                                            */
/* -------------------------------------------------------------------------- */

export interface CreatePaymentSessionRequest {
  /**
   * Financial Domain payment identifier.
   *
   * This links the provider payment to the corresponding
   * Financial Domain payment.
   */
  paymentId: string;

  /**
   * Financial payment reference.
   */
  paymentReference: string;

  /**
   * Booking associated with this payment.
   */
  bookingId: string;

  /**
   * Customer initiating the payment.
   */
  userId: string;

  /**
   * Creator receiving the payment.
   */
  creatorId: string;

  /**
   * Amount being processed.
   */
  amount: Money;

  /**
   * Selected payment provider.
   */
  provider: PaymentProvider;

  /**
   * Payment method.
   */
  method: PaymentMethod;

  customerName?: string;

  customerEmail?: string;

  customerPhone?: string;

  returnUrl?: string;

  cancelUrl?: string;

  webhookUrl?: string;

  /**
   * Provider-specific metadata.
   */
  metadata?: ProviderMetadata;

  /**
   * Duplicate request protection.
   */
  idempotencyKey: string;
}

export interface CreatePaymentSessionResponse {
  providerPaymentId: string;

  providerOrderId?: string;

  checkoutUrl?: string;

  clientSecret?: string;

  expiresAt?: Date;

  payload?: ProviderPayload;
}

/* -------------------------------------------------------------------------- */
/* Payment Verification                                                       */
/* -------------------------------------------------------------------------- */

export interface VerifyPaymentRequest {
  providerPaymentId: string;

  providerOrderId?: string;

  providerSignature?: string;

  metadata?: ProviderMetadata;
}

export interface VerifyPaymentResponse {
  verified: boolean;

  providerTransactionId?: string;

  providerStatus: string;

  payload?: ProviderPayload;
}

/* -------------------------------------------------------------------------- */
/* Payment Status                                                             */
/* -------------------------------------------------------------------------- */

export interface GetPaymentStatusRequest {
  providerPaymentId: string;
}

export interface GetPaymentStatusResponse {
  providerPaymentId: string;

  providerTransactionId?: string;

  providerStatus: string;

  /** Provider-verified amount. Required before a CAPTURED result can be
   * finalized by the provider-neutral operation reconciler. */
  amount?: Money;

  payload?: ProviderPayload;
}

export interface CancelPaymentRequest {
  providerPaymentId: string;
}

export interface CancelPaymentResponse {
  providerPaymentId: string;
  providerStatus: string;
  payload?: ProviderPayload;
}

/* -------------------------------------------------------------------------- */
/* Refund                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateRefundRequest {
  refundId: string;
  bookingId: string;
  refundReference: string;

  paymentReference: string;

  providerPaymentId: string;

  amount: Money;

  reason?: string;
  idempotencyKey: string;

  metadata?: ProviderMetadata;
}

export interface CreateRefundResponse {
  providerRefundId: string;

  providerStatus: string;

  payload?: ProviderPayload;
}

/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */

export interface VerifyWebhookRequest {
  headers: Record<string, string | string[] | undefined>;

  body: unknown;

  signature?: string;
}

export interface VerifyWebhookResponse {
  verified: boolean;

  providerEventId: string;

  providerEventType: string;

  payload: ProviderPayload;
}
