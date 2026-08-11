// backend/src/enums/financial/paymentProvider.enum.ts

/**
 * Supported payment providers.
 *
 * The Financial Domain is provider-agnostic. These values identify the
 * provider responsible for processing a payment while keeping the rest of
 * the domain independent of provider-specific implementations.
 *
 * INTERNAL is used by the current implementation. Additional providers can
 * be added later without changing the Financial Domain contracts.
 */
export enum PaymentProvider {
  /**
   * Internal payment provider used by the current implementation.
   */
  INTERNAL = "INTERNAL",

  /**
   * Reserved for future gateway integrations.
   */
  RAZORPAY = "RAZORPAY",
  STRIPE = "STRIPE",
  PAYPAL = "PAYPAL",
  CASHFREE = "CASHFREE",
  PHONEPE = "PHONEPE",
  CUSTOM = "CUSTOM",
}
