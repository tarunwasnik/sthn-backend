"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRetryDelay = exports.WALLET_TOP_UP_RETRY_POLICY = void 0;
exports.WALLET_TOP_UP_RETRY_POLICY = {
    MAX_ACCOUNTING_RETRIES: 5,
    BASE_RETRY_DELAY_MS: 60000,
    MAX_RETRY_DELAY_MS: 60 * 60000,
};
const walletTopUpRetryDelay = (attempt) => Math.min(exports.WALLET_TOP_UP_RETRY_POLICY.BASE_RETRY_DELAY_MS * (2 ** Math.max(attempt - 1, 0)), exports.WALLET_TOP_UP_RETRY_POLICY.MAX_RETRY_DELAY_MS);
exports.walletTopUpRetryDelay = walletTopUpRetryDelay;
