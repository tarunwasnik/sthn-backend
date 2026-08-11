// backend/src/enums/financial/payoutStatus.enum.ts

/**
 * Represents the lifecycle of a creator payout.
 *
 * A payout transfers eligible creator earnings from the marketplace
 * to the creator. Payouts are generated only after all financial
 * eligibility requirements have been satisfied.
 */
export enum PayoutStatus {
  /**
   * Payout record has been created.
   */
  CREATED = "CREATED",

  /**
   * Waiting to enter payout processing.
   */
  PENDING = "PENDING",

  /**
   * Payout has been queued for execution.
   */
  QUEUED = "QUEUED",

  /**
   * Payout is currently being processed.
   */
  PROCESSING = "PROCESSING",

  /**
   * Payout completed successfully.
   */
  COMPLETED = "COMPLETED",

  /**
   * Payout failed and may be retried.
   */
  FAILED = "FAILED",

  /**
   * Payout has been cancelled.
   */
  CANCELLED = "CANCELLED",

  /**
   * Payout is temporarily on hold.
   */
  ON_HOLD = "ON_HOLD",

  /**
   * Payout has been reversed after completion.
   */
  REVERSED = "REVERSED",
}
