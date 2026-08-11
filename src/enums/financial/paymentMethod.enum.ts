// backend/src/enums/financial/paymentMethod.enum.ts

/**
 * Supported payment methods.
 *
 * Payment methods describe how a customer pays for a booking.
 * These values are independent of any specific payment provider.
 *
 * The current implementation uses INTERNAL. Additional methods are
 * reserved for future gateway integrations without requiring changes
 * to the Financial Domain contracts.
 */
export enum PaymentMethod {
  /**
   * Internal payment mechanism used by the current implementation.
   */
  INTERNAL = "INTERNAL",

  /**
   * Future payment methods.
   */
  CARD = "CARD",
  NET_BANKING = "NET_BANKING",
  UPI = "UPI",
  WALLET = "WALLET",
  BANK_TRANSFER = "BANK_TRANSFER",
  CASH = "CASH",
  OTHER = "OTHER",
}