// backend/src/errors/financial/ReconciliationError.ts

import { FinancialError } from "./FinancialError";

/**
 * Base error for all reconciliation-related failures.
 *
 * Reconciliation compares internal financial records with
 * provider/platform records to detect inconsistencies.
 *
 * Specific reconciliation errors should extend this class where appropriate.
 */
export class ReconciliationError extends FinancialError {
  constructor(
    message = "Financial reconciliation failed.",
    code = "RECONCILIATION_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message, code, options);

    this.name = this.constructor.name;
  }
}
