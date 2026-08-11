// backend/src/types/financial/paymentMetadata.type.ts

import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

/**
 * Additional metadata associated with a payment.
 *
 * This object stores provider-specific and operational information
 * without affecting the canonical Payment model. It allows future
 * payment gateway integrations while keeping the Financial Domain
 * provider-independent.
 */
export interface PaymentMetadata {
  /**
   * Payment provider responsible for processing the payment.
   */
  provider: PaymentProvider;

  /**
   * Payment method used.
   */
  method: PaymentMethod;

  /**
   * Provider payment reference.
   */
  providerPaymentId?: string;

  /**
   * Provider transaction reference.
   */
  providerTransactionId?: string;

  /**
   * Provider order / intent reference.
   */
  providerOrderId?: string;

  /**
   * Provider customer reference.
   */
  providerCustomerId?: string;

  /**
   * Provider authorization reference.
   */
  authorizationId?: string;

  /**
   * Provider settlement reference.
   */
  settlementId?: string;

  /**
   * Provider refund reference.
   */
  refundId?: string;

  /**
   * Number of payment attempts.
   */
  attemptNumber?: number;

  /**
   * Indicates whether the payment can be retried.
   */
  retryable?: boolean;

  /**
   * Failure reason mapped into the Financial Domain.
   */
  failureReason?: PaymentFailureReason;

  /**
   * Human-readable failure message.
   */
  failureMessage?: string;

  /**
   * Idempotency key used for this payment operation.
   */
  idempotencyKey?: string;

  /**
   * Optional provider payload retained for auditing and debugging.
   * Should never contain secrets or sensitive credentials.
   */
  providerPayload?: Record<string, unknown>;

  /**
   * Additional extensible metadata.
   */
  attributes?: Record<string, unknown>;
}
