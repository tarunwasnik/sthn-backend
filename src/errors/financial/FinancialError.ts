// backend/src/errors/financial/FinancialError.ts

/**
 * Base error for the Financial Domain.
 *
 * All financial-specific errors should extend this class to provide
 * consistent error handling across payments, refunds, settlements,
 * payouts, ledgers, balances, and reconciliation.
 */
export class FinancialError extends Error {
  /**
   * Machine-readable error code.
   */
  public readonly code: string;

  /**
   * Indicates whether the error is safe to expose to clients.
   */
  public readonly isOperational: boolean;

  /**
   * Optional underlying cause.
   */
  public readonly cause?: unknown;

  constructor(
    message: string,
    code = "FINANCIAL_ERROR",
    options?: {
      cause?: unknown;
      isOperational?: boolean;
    },
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.cause = options?.cause;
    this.isOperational = options?.isOperational ?? true;

    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
