// backend/src/errors/financial/PaymentError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all payment-related failures.
 *
 * Specific payment errors should extend this class where appropriate.
 */
export class PaymentError extends FinancialError {
  constructor(
    message = "Payment operation failed.",
    code = "PAYMENT_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
