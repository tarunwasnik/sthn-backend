// backend/src/enums/financial/financialLockReason.enum.ts

/**
 * Canonical reasons for placing a financial lock on an entity.
 *
 * Financial locks prevent downstream financial operations until
 * the blocking condition has been resolved. These values are used
 * throughout the Financial Domain for validation, automation,
 * auditing, and reporting.
 */
export enum FinancialLockReason {
  /**
   * No active financial lock.
   */
  NONE = "NONE",

  /**
   * Payment has not yet been settled.
   */
  PAYMENT_PENDING = "PAYMENT_PENDING",

  /**
   * Settlement is still in progress.
   */
  SETTLEMENT_PENDING = "SETTLEMENT_PENDING",

  /**
   * Refund is currently being processed.
   */
  REFUND_PENDING = "REFUND_PENDING",

  /**
   * Booking is under dispute.
   */
  DISPUTE_OPEN = "DISPUTE_OPEN",

  /**
   * Cooling period before payability has not completed.
   */
  COOLING_PERIOD = "COOLING_PERIOD",

  /**
   * Booking has not yet become payable.
   */
  NOT_PAYABLE = "NOT_PAYABLE",

  /**
   * Booking has not yet become payout eligible.
   */
  NOT_PAYOUT_ELIGIBLE = "NOT_PAYOUT_ELIGIBLE",

  /**
   * Payout is currently being processed.
   */
  PAYOUT_IN_PROGRESS = "PAYOUT_IN_PROGRESS",

  /**
   * Creator account is restricted from financial operations.
   */
  CREATOR_RESTRICTED = "CREATOR_RESTRICTED",

  /**
   * Manual administrative hold.
   */
  ADMIN_HOLD = "ADMIN_HOLD",

  /**
   * Financial reconciliation is in progress.
   */
  RECONCILIATION = "RECONCILIATION",

  /**
   * Internal system validation or maintenance.
   */
  SYSTEM = "SYSTEM",
}
