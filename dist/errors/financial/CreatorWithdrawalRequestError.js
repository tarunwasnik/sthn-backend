"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalRequestError = void 0;
const FinancialError_1 = require("./FinancialError");
class CreatorWithdrawalRequestError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "CreatorWithdrawalRequestError";
        this.statusCode = code.endsWith("_MISSING")
            ? 404
            : code === "CREATOR_WITHDRAWAL_INVALID_REQUEST"
                ? 400
                : 409;
    }
}
exports.CreatorWithdrawalRequestError = CreatorWithdrawalRequestError;
