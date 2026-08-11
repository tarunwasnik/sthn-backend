// backend/src/constants/internalProvider/providerPayoutStatus.enum.ts

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payout Status
 * ------------------------------------------------------------------
 *
 * Represents the payout lifecycle maintained by the payment
 * provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain PayoutStatus.
 *
 * Financial Domain:
 *      Payout.status
 *
 * Internal Provider:
 *      InternalPayout.providerStatus
 * ------------------------------------------------------------------
 */

export enum ProviderPayoutStatus {
  /**
   * Payout has been created.
   */
  CREATED = "CREATED",

  /**
   * Payout has been scheduled.
   */
  SCHEDULED = "SCHEDULED",

  /**
   * Payout is waiting to be processed.
   */
  PENDING = "PENDING",

  /**
   * Payout is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Payout has been initiated to the destination account.
   */
  INITIATED = "INITIATED",

  /**
   * A portion of the payout has been completed.
   */
  PARTIALLY_PAID = "PARTIALLY_PAID",

  /**
   * Payout completed successfully.
   */
  PAID = "PAID",

  /**
   * Payout failed.
   */
  FAILED = "FAILED",

  /**
   * Payout was cancelled.
   */
  CANCELLED = "CANCELLED",

  /**
   * Payout expired before completion.
   */
  EXPIRED = "EXPIRED",

  /**
   * Funds were returned back to the platform/provider.
   */
  REVERSED = "REVERSED",
}

export default ProviderPayoutStatus;
