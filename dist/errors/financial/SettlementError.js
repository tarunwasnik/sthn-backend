"use strict";
// backend/src/errors/financial/SettlementError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all settlement-related failures.
 *
 * Specific settlement errors should extend this class where appropriate.
 */
class SettlementError extends FinancialError_1.FinancialError {
    constructor(message = "Settlement operation failed.", code = "SETTLEMENT_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.SettlementError = SettlementError;
