"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalRetryDelay = exports.MAX_WITHDRAWAL_RETRY_DELAY_MS = exports.BASE_WITHDRAWAL_RETRY_DELAY_MS = exports.MAX_WITHDRAWAL_FINALIZATION_RETRIES = void 0;
exports.MAX_WITHDRAWAL_FINALIZATION_RETRIES = 5;
exports.BASE_WITHDRAWAL_RETRY_DELAY_MS = 1000;
exports.MAX_WITHDRAWAL_RETRY_DELAY_MS = 60000;
const withdrawalRetryDelay = (attempt) => Math.min(exports.BASE_WITHDRAWAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1), exports.MAX_WITHDRAWAL_RETRY_DELAY_MS);
exports.withdrawalRetryDelay = withdrawalRetryDelay;
