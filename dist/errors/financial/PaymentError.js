"use strict";
// backend/src/errors/financial/PaymentError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all payment-related failures.
 *
 * Specific payment errors should extend this class where appropriate.
 */
class PaymentError extends FinancialError_1.FinancialError {
    constructor(message = "Payment operation failed.", code = "PAYMENT_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.PaymentError = PaymentError;
