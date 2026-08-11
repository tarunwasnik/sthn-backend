"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletError = void 0;
const BalanceError_1 = require("./BalanceError");
class WalletError extends BalanceError_1.BalanceError {
    constructor(message, code = "WALLET_ERROR", cause) {
        super(message, code, { cause });
        this.name = this.constructor.name;
    }
}
exports.WalletError = WalletError;
