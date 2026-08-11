// backend/src/errors/financial/LedgerError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all ledger-related failures.
 *
 * Specific ledger errors should extend this class where appropriate.
 */
export class LedgerError extends FinancialError {
  constructor(
    message = "Ledger operation failed.",
    code = "LEDGER_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
