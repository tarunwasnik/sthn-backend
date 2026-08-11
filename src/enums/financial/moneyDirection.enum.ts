// backend/src/enums/financial/moneyDirection.enum.ts

/**
 * Represents the direction of a monetary movement within the
 * Financial Domain.
 *
 * These values are shared by the Ledger, Transactions, Creator
 * Balances, Settlements, Payouts, Reporting, and Audit modules.
 *
 * The direction is always interpreted relative to the account or
 * financial entity receiving the ledger entry.
 */
export enum MoneyDirection {
  /**
   * Money increases the balance of the target account.
   */
  CREDIT = "CREDIT",

  /**
   * Money decreases the balance of the target account.
   */
  DEBIT = "DEBIT",
}
