// backend/src/enums/financial/ledgerEntryType.enum.ts

/**
 * Defines the immutable category of a ledger entry.
 *
 * Every financial movement recorded within the Financial Domain
 * is persisted as an immutable ledger entry. The entry type
 * identifies the business purpose of that movement.
 *
 * Ledger entries are write-once and must never be modified
 * or deleted after creation.
 */
export enum LedgerEntryType {
  WALLET_TOP_UP = "WALLET_TOP_UP",
  BOOKING_FUNDS_RESERVED = "BOOKING_FUNDS_RESERVED",
  BOOKING_FUNDS_RELEASED = "BOOKING_FUNDS_RELEASED",
  BOOKING_FUNDS_CAPTURED = "BOOKING_FUNDS_CAPTURED",
  BOOKING_ESCROW_ALLOCATED = "BOOKING_ESCROW_ALLOCATED",
  BOOKING_CREATOR_SETTLED = "BOOKING_CREATOR_SETTLED",
  CREATOR_WITHDRAWAL_RESERVED = "CREATOR_WITHDRAWAL_RESERVED",
  CREATOR_WITHDRAWAL_COMPLETED = "CREATOR_WITHDRAWAL_COMPLETED",
  CREATOR_WITHDRAWAL_FAILED_RELEASED =
    "CREATOR_WITHDRAWAL_FAILED_RELEASED",
  WALLET_CONVERSION_COMPLETED = "WALLET_CONVERSION_COMPLETED",
  /**
   * Initial customer payment.
   */
  PAYMENT = "PAYMENT",

  /**
   * Refund issued to the customer.
   */
  REFUND = "REFUND",

  /**
   * Platform commission earned.
   */
  COMMISSION = "COMMISSION",

  /**
   * Creator earnings generated from a booking.
   */
  CREATOR_EARNING = "CREATOR_EARNING",

  /**
   * Settlement of captured funds.
   */
  SETTLEMENT = "SETTLEMENT",

  /**
   * Creator payout.
   */
  PAYOUT = "PAYOUT",

  /**
   * Manual financial adjustment.
   */
  ADJUSTMENT = "ADJUSTMENT",

  /**
   * Correction to a previous financial entry.
   */
  CORRECTION = "CORRECTION",

  /**
   * Reversal of a previous financial transaction.
   */
  REVERSAL = "REVERSAL",

  /**
   * Administrative write-off.
   */
  WRITE_OFF = "WRITE_OFF",

  /**
   * Administrative credit.
   */
  CREDIT = "CREDIT",

  /**
   * Administrative debit.
   */
  DEBIT = "DEBIT",
}
