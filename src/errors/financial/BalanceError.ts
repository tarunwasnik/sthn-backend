// backend/src/errors/financial/BalanceError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all balance-related failures.
 *
 * This includes creator balances, platform balances,
 * balance calculations, and balance updates.
 *
 * Specific balance errors should extend this class where appropriate.
 */
export class BalanceError extends FinancialError {
  constructor(
    message = "Balance operation failed.",
    code = "BALANCE_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
