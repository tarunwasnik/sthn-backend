"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalFinalizationError = void 0;
const FinancialError_1 = require("./FinancialError");
class CreatorWithdrawalFinalizationError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "CreatorWithdrawalFinalizationError";
        this.statusCode = code.endsWith("_NOT_FOUND")
            ? 404
            : code === "CREATOR_WITHDRAWAL_FINALIZATION_INTEGRITY_ERROR"
                ? 500
                : 409;
    }
}
exports.CreatorWithdrawalFinalizationError = CreatorWithdrawalFinalizationError;
