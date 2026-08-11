"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalProviderInitializationError = void 0;
const FinancialError_1 = require("./FinancialError");
class WithdrawalProviderInitializationError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "WithdrawalProviderInitializationError";
        this.statusCode = code.endsWith("_MISSING") ? 404 : 409;
    }
}
exports.WithdrawalProviderInitializationError = WithdrawalProviderInitializationError;
