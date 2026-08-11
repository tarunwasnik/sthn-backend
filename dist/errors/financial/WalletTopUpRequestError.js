"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpRequestError = void 0;
const FinancialError_1 = require("./FinancialError");
class WalletTopUpRequestError extends FinancialError_1.FinancialError {
    constructor(message = "Wallet top-up request failed.", code = "WALLET_TOP_UP_REQUEST_ERROR") { super(message, code); this.name = this.constructor.name; }
}
exports.WalletTopUpRequestError = WalletTopUpRequestError;
