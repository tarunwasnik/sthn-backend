// backend/src/errors/financial/PayoutError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all payout-related failures.
 *
 * Specific payout errors should extend this class where appropriate.
 */
export class PayoutError extends FinancialError {
  constructor(
    message = "Payout operation failed.",
    code = "PAYOUT_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
