// backend/src/types/financial/refundMetadata.type.ts

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { RefundReason } from "../../enums/financial/refundReason.enum";
import { RefundStatus } from "../../enums/financial/refundStatus.enum";

/**
 * Additional metadata associated with a refund.
 *
 * This structure stores provider-specific and operational information
 * while keeping the Refund model provider-independent.
 */
export interface RefundMetadata {
  /**
   * Payment provider responsible for processing the refund.
   */
  provider: PaymentProvider;

  /**
   * Reason for the refund.
   */
  reason: RefundReason;

  /**
   * Current provider refund status.
   */
  status: RefundStatus;

  /**
   * Provider refund reference.
   */
  providerRefundId?: string;

  /**
   * Original provider payment reference.
   */
  providerPaymentId?: string;

  /**
   * Provider settlement reference, if applicable.
   */
  settlementId?: string;

  /**
   * Number of refund attempts.
   */
  attemptNumber?: number;

  /**
   * Indicates whether the refund can be retried.
   */
  retryable?: boolean;

  /**
   * Human-readable failure message.
   */
  failureMessage?: string;

  /**
   * Idempotency key used for this refund operation.
   */
  idempotencyKey?: string;

  /**
   * Optional provider payload retained for auditing and debugging.
   * Must never contain secrets or sensitive credentials.
   */
  providerPayload?: Record<string, unknown>;

  /**
   * Additional extensible metadata.
   */
  attributes?: Record<string, unknown>;
}
