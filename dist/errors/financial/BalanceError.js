"use strict";
// backend/src/errors/financial/BalanceError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all balance-related failures.
 *
 * This includes creator balances, platform balances,
 * balance calculations, and balance updates.
 *
 * Specific balance errors should extend this class where appropriate.
 */
class BalanceError extends FinancialError_1.FinancialError {
    constructor(message = "Balance operation failed.", code = "BALANCE_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.BalanceError = BalanceError;
