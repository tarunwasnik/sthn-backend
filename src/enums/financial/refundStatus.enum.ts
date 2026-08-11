// backend/src/enums/financial/refundStatus.enum.ts

/**
 * Represents the lifecycle state of a refund.
 *
 * Refunds are independent financial entities linked to a Payment.
 * Provider-specific refund states must be mapped to these canonical
 * Financial Domain statuses.
 */
export enum RefundStatus {
  /**
   * Refund record has been created.
   */
  CREATED = "CREATED",

  /**
   * Refund request is awaiting validation or approval.
   */
  PENDING = "PENDING",

  /**
   * Refund has been approved for execution.
   */
  APPROVED = "APPROVED",

  /**
   * Refund is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Refund completed successfully.
   */
  COMPLETED = "COMPLETED",

  /**
   * Refund failed permanently.
   */
  FAILED = "FAILED",

  /**
   * Refund request was rejected.
   */
  REJECTED = "REJECTED",

  /**
   * Refund was cancelled before execution.
   */
  CANCELLED = "CANCELLED",

  /**
   * Refund expired before it could be completed.
   */
  EXPIRED = "EXPIRED",

  /**
   * Refund was only partially completed.
   */
  PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
}
