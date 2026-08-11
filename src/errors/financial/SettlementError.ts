// backend/src/errors/financial/SettlementError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all settlement-related failures.
 *
 * Specific settlement errors should extend this class where appropriate.
 */
export class SettlementError extends FinancialError {
  constructor(
    message = "Settlement operation failed.",
    code = "SETTLEMENT_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
