"use strict";
// backend/src/errors/financial/PayoutError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayoutError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all payout-related failures.
 *
 * Specific payout errors should extend this class where appropriate.
 */
class PayoutError extends FinancialError_1.FinancialError {
    constructor(message = "Payout operation failed.", code = "PAYOUT_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.PayoutError = PayoutError;
