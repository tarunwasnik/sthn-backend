// backend/src/errors/financial/RefundError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all refund-related failures.
 *
 * Specific refund errors should extend this class where appropriate.
 */
export class RefundError extends FinancialError {
  constructor(
    message = "Refund operation failed.",
    code = "REFUND_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
