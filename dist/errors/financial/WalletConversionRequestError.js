"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConversionRequestError = void 0;
const FinancialError_1 = require("./FinancialError");
class WalletConversionRequestError extends FinancialError_1.FinancialError {
    constructor(message, code, statusCode = 409, cause) {
        super(message, code, { cause });
        this.statusCode = statusCode;
    }
}
exports.WalletConversionRequestError = WalletConversionRequestError;
