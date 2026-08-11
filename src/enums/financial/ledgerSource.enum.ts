// backend/src/enums/financial/ledgerSource.enum.ts

/**
 * Identifies the originating source responsible for creating
 * an immutable ledger entry.
 *
 * While LedgerEntryType describes the business nature of the
 * financial movement, LedgerSource identifies the subsystem
 * or workflow that produced the entry.
 */
export enum LedgerSource {
  INTERNAL_TOP_UP_FUNDING = "INTERNAL_TOP_UP_FUNDING",
  BOOKING_WALLET_AUTHORIZATION = "BOOKING_WALLET_AUTHORIZATION",
  BOOKING_WALLET_RESERVATION_RELEASE = "BOOKING_WALLET_RESERVATION_RELEASE",
  BOOKING_WALLET_CAPTURE = "BOOKING_WALLET_CAPTURE",
  BOOKING_ESCROW_ALLOCATION = "BOOKING_ESCROW_ALLOCATION",
  BOOKING_CREATOR_WALLET_SETTLEMENT = "BOOKING_CREATOR_WALLET_SETTLEMENT",
  CREATOR_WITHDRAWAL_RESERVATION = "CREATOR_WITHDRAWAL_RESERVATION",
  WITHDRAWAL_PROVIDER_FINALIZATION = "WITHDRAWAL_PROVIDER_FINALIZATION",
  WALLET_CONVERSION = "WALLET_CONVERSION",
  /**
   * Payment lifecycle.
   */
  PAYMENT = "PAYMENT",

  /**
   * Refund lifecycle.
   */
  REFUND = "REFUND",

  /**
   * Settlement lifecycle.
   */
  SETTLEMENT = "SETTLEMENT",

  /**
   * Creator payout lifecycle.
   */
  PAYOUT = "PAYOUT",

  /**
   * Booking financial state transition.
   */
  BOOKING = "BOOKING",

  /**
   * Creator balance recalculation.
   */
  CREATOR_BALANCE = "CREATOR_BALANCE",

  /**
   * Financial reconciliation process.
   */
  RECONCILIATION = "RECONCILIATION",

  /**
   * Scheduled financial automation.
   */
  SCHEDULER = "SCHEDULER",

  /**
   * Manual administrative financial operation.
   */
  ADMIN = "ADMIN",

  /**
   * Internal system-generated operation.
   */
  SYSTEM = "SYSTEM",
}
