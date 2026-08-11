"use strict";
// backend/src/errors/financial/RefundError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all refund-related failures.
 *
 * Specific refund errors should extend this class where appropriate.
 */
class RefundError extends FinancialError_1.FinancialError {
    constructor(message = "Refund operation failed.", code = "REFUND_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.RefundError = RefundError;
