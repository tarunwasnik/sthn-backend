"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConversionProviderExecutionError = void 0;
const FinancialError_1 = require("./FinancialError");
class WalletConversionProviderExecutionError extends FinancialError_1.FinancialError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = "WalletConversionProviderExecutionError";
        this.statusCode = code.endsWith("UNAUTHORIZED") ? 401 :
            code.endsWith("INVALID_INPUT") ? 422 :
                code.endsWith("NOT_FOUND") ? 404 : 409;
    }
}
exports.WalletConversionProviderExecutionError = WalletConversionProviderExecutionError;
