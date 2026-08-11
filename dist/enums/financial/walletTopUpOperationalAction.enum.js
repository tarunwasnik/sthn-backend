"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpOperationalAction = void 0;
var WalletTopUpOperationalAction;
(function (WalletTopUpOperationalAction) {
    WalletTopUpOperationalAction["INSPECT"] = "INSPECT";
    WalletTopUpOperationalAction["FINALIZE_PROVIDER_FAILURE"] = "FINALIZE_PROVIDER_FAILURE";
    WalletTopUpOperationalAction["RETRY_ACCOUNTING"] = "RETRY_ACCOUNTING";
    WalletTopUpOperationalAction["RETRY_COMPLETION"] = "RETRY_COMPLETION";
    WalletTopUpOperationalAction["MARK_RECONCILIATION_REQUIRED"] = "MARK_RECONCILIATION_REQUIRED";
    WalletTopUpOperationalAction["REPAIR_REQUEST_LINKS"] = "REPAIR_REQUEST_LINKS";
    WalletTopUpOperationalAction["REPAIR_PROJECTION_LINK"] = "REPAIR_PROJECTION_LINK";
    WalletTopUpOperationalAction["REPAIR_LEDGER_LINK"] = "REPAIR_LEDGER_LINK";
    WalletTopUpOperationalAction["ACKNOWLEDGE_CORRUPTION"] = "ACKNOWLEDGE_CORRUPTION";
    WalletTopUpOperationalAction["RESOLVE_RECONCILIATION"] = "RESOLVE_RECONCILIATION";
})(WalletTopUpOperationalAction || (exports.WalletTopUpOperationalAction = WalletTopUpOperationalAction = {}));
