"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalError = void 0;
const FinancialError_1 = require("./FinancialError");
class WithdrawalError extends FinancialError_1.FinancialError {
    constructor(message = "Withdrawal operation failed.", code = "WITHDRAWAL_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.WithdrawalError = WithdrawalError;
