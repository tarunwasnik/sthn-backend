// backend/src/types/financial/currencyAmount.type.ts

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
/**
 * Represents an amount in a specific supported currency.
 *
 * Unlike the Money type, this structure is intended for financial
 * summaries, reporting, balances, analytics, and DTOs where the value
 * simply represents an amount associated with a currency.
 *
 * Rules:
 * - Amount is always stored in minor units.
 * - Floating-point values are never stored.
 * - Currency must be one of the marketplace-supported currencies.
 */
export interface CurrencyAmount {
  /**
   * Monetary value in minor units.
   *
   * Examples:
   * INR 100.25 -> 10025
   * USD 49.99  -> 4999
   */
  amount: number;

  /**
   * ISO currency code.
   */
  currency: SupportedCurrency;
}
