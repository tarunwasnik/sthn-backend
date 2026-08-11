// backend/src/types/financial/money.type.ts

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
/**
 * Canonical monetary value used throughout the Financial Domain.
 *
 * Rules:
 * - Amounts are always stored in minor units.
 * - Floating-point values are never stored.
 * - Currency must be one of the marketplace-supported currencies.
 *
 * Examples:
 * ₹100.25 -> amount = 10025
 * $49.99  -> amount = 4999
 */
export interface Money {
  /**
   * Monetary amount in minor units.
   *
   * Examples:
   * INR:
   *   ₹100.25 => 10025
   *
   * USD:
   *   $49.99 => 4999
   */
  amount: number;

  /**
   * ISO currency code supported by the marketplace.
   */
  currency: SupportedCurrency;
}
