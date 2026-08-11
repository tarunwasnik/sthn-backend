"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalProviderExecutionError = void 0;
const FinancialError_1 = require("./FinancialError");
class WithdrawalProviderExecutionError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "WithdrawalProviderExecutionError";
        this.statusCode = code.endsWith("_MISSING") ? 404 : 409;
    }
}
exports.WithdrawalProviderExecutionError = WithdrawalProviderExecutionError;
