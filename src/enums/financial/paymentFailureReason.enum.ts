// backend/src/enums/financial/paymentFailureReason.enum.ts

/**
 * Canonical reasons describing why a payment could not be completed.
 *
 * These values are provider-independent. Any provider-specific failure
 * codes should be mapped to one of these reasons by the payment provider
 * implementation before entering the Financial Domain.
 */
export enum PaymentFailureReason {
  /**
   * No failure has occurred.
   */
  NONE = "NONE",

  /**
   * Authorization was declined.
   */
  AUTHORIZATION_DECLINED = "AUTHORIZATION_DECLINED",

  /**
   * Capture operation failed.
   */
  CAPTURE_FAILED = "CAPTURE_FAILED",

  /**
   * Settlement failed.
   */
  SETTLEMENT_FAILED = "SETTLEMENT_FAILED",

  /**
   * Payment expired before completion.
   */
  PAYMENT_EXPIRED = "PAYMENT_EXPIRED",

  /**
   * Payment was cancelled.
   */
  PAYMENT_CANCELLED = "PAYMENT_CANCELLED",

  /**
   * Duplicate payment or idempotency conflict.
   */
  DUPLICATE_PAYMENT = "DUPLICATE_PAYMENT",

  /**
   * Invalid payment request.
   */
  VALIDATION_FAILED = "VALIDATION_FAILED",

  /**
   * Currency mismatch.
   */
  CURRENCY_MISMATCH = "CURRENCY_MISMATCH",

  /**
   * Amount mismatch.
   */
  AMOUNT_MISMATCH = "AMOUNT_MISMATCH",

  /**
   * Booking is not eligible for payment.
   */
  BOOKING_NOT_PAYABLE = "BOOKING_NOT_PAYABLE",

  /**
   * Provider communication failed.
   */
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",

  /**
   * Provider returned an unexpected response.
   */
  PROVIDER_ERROR = "PROVIDER_ERROR",

  /**
   * Request timed out.
   */
  TIMEOUT = "TIMEOUT",

  /**
   * Internal financial processing error.
   */
  INTERNAL_ERROR = "INTERNAL_ERROR",

  /**
   * Failure reason could not be determined.
   */
  UNKNOWN = "UNKNOWN",
}
