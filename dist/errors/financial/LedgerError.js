"use strict";
// backend/src/errors/financial/LedgerError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all ledger-related failures.
 *
 * Specific ledger errors should extend this class where appropriate.
 */
class LedgerError extends FinancialError_1.FinancialError {
    constructor(message = "Ledger operation failed.", code = "LEDGER_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.LedgerError = LedgerError;
