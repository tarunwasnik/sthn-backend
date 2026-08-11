"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalOperationalError = void 0;
const FinancialError_1 = require("./FinancialError");
class CreatorWithdrawalOperationalError extends FinancialError_1.FinancialError {
    constructor(message, code, cause) {
        super(message, code, { cause });
        this.name = "CreatorWithdrawalOperationalError";
        this.statusCode = code.endsWith("_NOT_FOUND") ? 404
            : code.endsWith("_INTEGRITY_ERROR") ? 500 : 409;
    }
}
exports.CreatorWithdrawalOperationalError = CreatorWithdrawalOperationalError;
