"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpReconciliationError = exports.WalletTopUpReconciliationErrorCode = void 0;
const FinancialError_1 = require("./FinancialError");
exports.WalletTopUpReconciliationErrorCode = {
    REQUEST_NOT_FOUND: "WALLET_TOP_UP_RECONCILIATION_REQUEST_NOT_FOUND",
    NOT_FOUND: "WALLET_TOP_UP_RECONCILIATION_NOT_FOUND",
    ALREADY_RESOLVED: "WALLET_TOP_UP_RECONCILIATION_ALREADY_RESOLVED",
    INVALID_STATUS: "WALLET_TOP_UP_RECONCILIATION_INVALID_STATUS",
    INVALID_ACTION: "WALLET_TOP_UP_RECONCILIATION_INVALID_ACTION",
    CLASSIFICATION_CHANGED: "WALLET_TOP_UP_RECONCILIATION_CLASSIFICATION_CHANGED",
    SNAPSHOT_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_SNAPSHOT_CONFLICT",
    RETRY_LIMIT_EXCEEDED: "WALLET_TOP_UP_RECONCILIATION_RETRY_LIMIT_EXCEEDED",
    RETRY_NOT_ALLOWED: "WALLET_TOP_UP_RECONCILIATION_RETRY_NOT_ALLOWED",
    REPAIR_NOT_ALLOWED: "WALLET_TOP_UP_RECONCILIATION_REPAIR_NOT_ALLOWED",
    REPAIR_AMBIGUOUS: "WALLET_TOP_UP_RECONCILIATION_REPAIR_AMBIGUOUS",
    REPAIR_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_REPAIR_CONFLICT",
    PROVIDER_FAILURE_CONFLICT: "WALLET_TOP_UP_RECONCILIATION_PROVIDER_FAILURE_CONFLICT",
    INTEGRITY_ERROR: "WALLET_TOP_UP_RECONCILIATION_INTEGRITY_ERROR",
};
class WalletTopUpReconciliationError extends FinancialError_1.FinancialError {
    static statusFor(code) {
        if (code === exports.WalletTopUpReconciliationErrorCode.NOT_FOUND ||
            code === exports.WalletTopUpReconciliationErrorCode.REQUEST_NOT_FOUND)
            return 404;
        if (code === exports.WalletTopUpReconciliationErrorCode.INTEGRITY_ERROR)
            return 500;
        return 409;
    }
    constructor(message, code, statusCode) {
        super(message, code);
        this.name = this.constructor.name;
        this.statusCode = statusCode ?? WalletTopUpReconciliationError.statusFor(code);
    }
}
exports.WalletTopUpReconciliationError = WalletTopUpReconciliationError;
