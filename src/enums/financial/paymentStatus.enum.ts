// backend/src/enums/financial/paymentStatus.enum.ts

/**
 * Represents the lifecycle state of a payment.
 *
 * This enum is shared across the Financial Domain and must remain
 * provider-independent. External payment gateways should map their
 * proprietary statuses to these internal statuses.
 */
export enum PaymentStatus {
  /**
   * Payment record has been created but processing has not started.
   */
  CREATED = "CREATED",

  /**
   * Payment initialization is in progress.
   */
  INITIALIZING = "INITIALIZING",

  /**
   * Payment is awaiting authorization.
   */
  PENDING = "PENDING",

  /**
   * Funds have been authorized but not yet captured.
   */
  AUTHORIZED = "AUTHORIZED",

  /**
   * Funds have been successfully captured.
   */
  CAPTURED = "CAPTURED",

  /**
   * Payment has been successfully settled.
   */
  SETTLED = "SETTLED",

  /**
   * Payment has been fully refunded.
   */
  REFUNDED = "REFUNDED",

  /**
   * Payment has been partially refunded.
   */
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",

  /**
   * Payment failed permanently.
   */
  FAILED = "FAILED",

  /**
   * Payment has expired before completion.
   */
  EXPIRED = "EXPIRED",

  /**
   * Payment was cancelled.
   */
  CANCELLED = "CANCELLED",
}
