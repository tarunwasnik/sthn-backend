// backend/src/enums/financial/refundReason.enum.ts

/**
 * Canonical reasons for initiating a refund.
 *
 * These reasons are used throughout the Financial Domain for validation,
 * auditing, reporting, automation, and analytics. Provider-specific
 * reasons should be mapped to one of these values.
 */
export enum RefundReason {
  /**
   * Booking was cancelled by the customer.
   */
  USER_CANCELLATION = "USER_CANCELLATION",

  /**
   * Booking was cancelled by the creator.
   */
  CREATOR_CANCELLATION = "CREATOR_CANCELLATION",

  /**
   * Booking request expired before acceptance.
   */
  BOOKING_EXPIRED = "BOOKING_EXPIRED",

  /**
   * Booking was rejected.
   */
  BOOKING_REJECTED = "BOOKING_REJECTED",

  /**
   * Refund approved after dispute resolution.
   */
  DISPUTE_RESOLUTION = "DISPUTE_RESOLUTION",

  /**
   * Manual administrative adjustment.
   */
  ADMIN_ADJUSTMENT = "ADMIN_ADJUSTMENT",

  /**
   * Duplicate payment detected.
   */
  DUPLICATE_PAYMENT = "DUPLICATE_PAYMENT",

  /**
   * Incorrect payment amount.
   */
  INCORRECT_AMOUNT = "INCORRECT_AMOUNT",

  /**
   * Fraud or security-related refund.
   */
  FRAUD_SUSPECTED = "FRAUD_SUSPECTED",

  /**
   * Payment processing error.
   */
  PAYMENT_ERROR = "PAYMENT_ERROR",

  /**
   * Service was unavailable or not delivered.
   */
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",

  /**
   * Other refund reason not covered by predefined values.
   */
  OTHER = "OTHER",
}
