// backend/src/constants/internalProvider/providerStatus.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payment Status
 * ------------------------------------------------------------------
 *
 * Represents the lifecycle of a payment inside the payment provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain PaymentStatus.
 *
 * Financial Domain:
 *      Payment.status
 *
 * Internal Provider:
 *      InternalPayment.providerStatus
 *
 * The Financial Domain consumes provider responses but remains
 * independent of provider-specific state transitions.
 * ------------------------------------------------------------------
 */

export enum ProviderStatus {
  /**
   * Payment record has been created by the provider.
   */
  CREATED = "CREATED",

  /**
   * Funds have been authorized but not yet captured.
   */
  AUTHORIZED = "AUTHORIZED",

  /**
   * A portion of the authorized amount has been captured.
   */
  PARTIALLY_CAPTURED = "PARTIALLY_CAPTURED",

  /**
   * Full payment amount has been captured.
   */
  CAPTURED = "CAPTURED",

  /**
   * Payment is awaiting settlement.
   */
  SETTLEMENT_PENDING = "SETTLEMENT_PENDING",

  /**
   * Settlement has been completed successfully.
   */
  SETTLED = "SETTLED",

  /**
   * Payment has been partially refunded.
   */
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",

  /**
   * Payment has been fully refunded.
   */
  REFUNDED = "REFUNDED",

  /**
   * Provider rejected or failed the payment.
   */
  FAILED = "FAILED",

  /**
   * Payment was cancelled before completion.
   */
  CANCELLED = "CANCELLED",

  /**
   * Authorization or payment expired before capture.
   */
  EXPIRED = "EXPIRED",
}

export default ProviderStatus;
