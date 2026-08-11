// backend/src/enums/financial/balanceType.enum.ts

/**
 * Represents the different balance buckets maintained by the
 * Financial Domain for creators.
 *
 * Balances are derived from immutable ledger entries and must
 * never be updated by directly calculating from payments.
 */
export enum BalanceType {
  /**
   * Earnings that are awaiting settlement or payability.
   */
  PENDING = "PENDING",

  /**
   * Earnings currently locked by financial rules.
   */
  LOCKED = "LOCKED",

  /**
   * Earnings available for payout.
   */
  AVAILABLE = "AVAILABLE",

  /**
   * Earnings currently queued for payout processing.
   */
  PAYOUT_PENDING = "PAYOUT_PENDING",

  /**
   * Earnings that have already been paid out.
   */
  PAID_OUT = "PAID_OUT",

  /**
   * Lifetime gross earnings.
   */
  LIFETIME_GROSS = "LIFETIME_GROSS",

  /**
   * Lifetime net earnings after deductions.
   */
  LIFETIME_NET = "LIFETIME_NET",

  /**
   * Lifetime platform commission deducted from creator earnings.
   */
  LIFETIME_COMMISSION = "LIFETIME_COMMISSION",

  /**
   * Lifetime refunded amount affecting creator earnings.
   */
  LIFETIME_REFUNDED = "LIFETIME_REFUNDED",
}
