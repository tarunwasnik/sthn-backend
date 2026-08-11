"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpReconciliationStatus = void 0;
var WalletTopUpReconciliationStatus;
(function (WalletTopUpReconciliationStatus) {
    WalletTopUpReconciliationStatus["OPEN"] = "OPEN";
    WalletTopUpReconciliationStatus["RETRY_SCHEDULED"] = "RETRY_SCHEDULED";
    WalletTopUpReconciliationStatus["IN_PROGRESS"] = "IN_PROGRESS";
    WalletTopUpReconciliationStatus["RESOLVED"] = "RESOLVED";
    WalletTopUpReconciliationStatus["ACKNOWLEDGED"] = "ACKNOWLEDGED";
    WalletTopUpReconciliationStatus["FAILED"] = "FAILED";
})(WalletTopUpReconciliationStatus || (exports.WalletTopUpReconciliationStatus = WalletTopUpReconciliationStatus = {}));
