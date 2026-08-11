// backend/src/constants/financial/financialLimits.ts

/**
 * Global financial limits used across the Financial Domain.
 *
 * All monetary values are expressed in minor units unless otherwise stated.
 * These defaults are intentionally provider-agnostic and may be overridden
 * by environment configuration or provider-specific rules in the future.
 */

export const FINANCIAL_LIMITS = {
  /**
   * Smallest supported transaction amount.
   * Example: 1 = ₹0.01 / $0.01
   */
  MIN_TRANSACTION_AMOUNT: 1,

  /**
   * Largest supported transaction amount.
   * Example:
   * 999999999999 = 9,999,999,999.99
   */
  MAX_TRANSACTION_AMOUNT: 999_999_999_999,

  /**
   * Maximum retry attempts.
   */
  MAX_PAYMENT_RETRIES: 3,

  /**
   * Maximum refund retry attempts.
   */
  MAX_REFUND_RETRIES: 3,

  /**
   * Maximum payout retry attempts.
   */
  MAX_PAYOUT_RETRIES: 3,

  /**
   * Maximum idempotency key length.
   */
  MAX_IDEMPOTENCY_KEY_LENGTH: 128,

  /**
   * Maximum provider reference length.
   */
  MAX_PROVIDER_REFERENCE_LENGTH: 255,

  /**
   * Maximum metadata object size.
   * (Approximate number of top-level keys.)
   */
  MAX_METADATA_PROPERTIES: 100,

  /**
   * Maximum supported monetary precision.
   *
   * Since all values are stored in minor units,
   * this remains fixed at two decimal places.
   */
  MONEY_DECIMAL_PLACES: 2,
} as const;
