"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConversionAccountingError = void 0;
const FinancialError_1 = require("./FinancialError");
class WalletConversionAccountingError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "WalletConversionAccountingError";
        this.statusCode = code.endsWith("NOT_FOUND") ? 404 :
            code.endsWith("INVALID_INPUT") ? 422 : 409;
    }
}
exports.WalletConversionAccountingError = WalletConversionAccountingError;
