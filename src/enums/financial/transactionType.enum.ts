// backend/src/enums/financial/transactionType.enum.ts

/**
 * Represents the canonical business transaction types within the
 * Financial Domain.
 *
 * A transaction records a business financial operation. Multiple
 * immutable ledger entries may be produced from a single transaction.
 * These values are shared across payments, refunds, settlements,
 * payouts, reconciliation, reporting, and auditing.
 */
export enum TransactionType {
  /**
   * Customer payment for a booking.
   */
  PAYMENT = "PAYMENT",

  /**
   * Customer refund.
   */
  REFUND = "REFUND",

  /**
   * Settlement of captured payment.
   */
  SETTLEMENT = "SETTLEMENT",

  /**
   * Creator payout.
   */
  PAYOUT = "PAYOUT",

  /**
   * Platform commission allocation.
   */
  COMMISSION = "COMMISSION",

  /**
   * Creator earning allocation.
   */
  CREATOR_EARNING = "CREATOR_EARNING",

  /**
   * Manual financial adjustment.
   */
  ADJUSTMENT = "ADJUSTMENT",

  /**
   * Correction of a previous financial transaction.
   */
  CORRECTION = "CORRECTION",

  /**
   * Reversal of a previous financial transaction.
   */
  REVERSAL = "REVERSAL",

  /**
   * Internal balance transfer.
   */
  BALANCE_TRANSFER = "BALANCE_TRANSFER",

  /**
   * Financial reconciliation adjustment.
   */
  RECONCILIATION = "RECONCILIATION",
}
