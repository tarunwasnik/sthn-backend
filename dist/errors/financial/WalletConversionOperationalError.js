"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConversionOperationalError = void 0;
const FinancialError_1 = require("./FinancialError");
class WalletConversionOperationalError extends FinancialError_1.FinancialError {
    constructor(message, code, cause) {
        super(message, code, { cause });
        this.name = "WalletConversionOperationalError";
        this.statusCode = code.endsWith("_NOT_FOUND") ? 404
            : code.endsWith("_INVALID_INPUT") ? 422 : 409;
    }
}
exports.WalletConversionOperationalError = WalletConversionOperationalError;
