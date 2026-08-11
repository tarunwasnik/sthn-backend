"use strict";
// backend/src/errors/financial/FinancialError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialError = void 0;
/**
 * Base error for the Financial Domain.
 *
 * All financial-specific errors should extend this class to provide
 * consistent error handling across payments, refunds, settlements,
 * payouts, ledgers, balances, and reconciliation.
 */
class FinancialError extends Error {
    constructor(message, code = "FINANCIAL_ERROR", options) {
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
exports.FinancialError = FinancialError;
