// backend/src/constants/internalProvider/providerRefundStatus.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Refund Status
 * ------------------------------------------------------------------
 *
 * Represents the lifecycle of a refund inside the payment provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain RefundStatus.
 *
 * Financial Domain:
 *      Refund.status
 *
 * Internal Provider:
 *      InternalRefund.providerStatus
 * ------------------------------------------------------------------
 */

export enum ProviderRefundStatus {
  /**
   * Refund request has been created.
   */
  CREATED = "CREATED",

  /**
   * Refund has been accepted and is waiting for processing.
   */
  PENDING = "PENDING",

  /**
   * Refund is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Refund has been partially completed.
   */
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",

  /**
   * Refund completed successfully.
   */
  REFUNDED = "REFUNDED",

  /**
   * Refund failed.
   */
  FAILED = "FAILED",

  /**
   * Refund was cancelled before completion.
   */
  CANCELLED = "CANCELLED",

  /**
   * Refund request expired.
   */
  EXPIRED = "EXPIRED",
}

export default ProviderRefundStatus;
