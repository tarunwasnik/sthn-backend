"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialReconciliationReason = void 0;
var FinancialReconciliationReason;
(function (FinancialReconciliationReason) {
    FinancialReconciliationReason["MISSING_PAYMENT"] = "MISSING_PAYMENT";
    FinancialReconciliationReason["MULTIPLE_MATCHING_PAYMENTS"] = "MULTIPLE_MATCHING_PAYMENTS";
    FinancialReconciliationReason["MISSING_BOOKING_AMOUNT"] = "MISSING_BOOKING_AMOUNT";
    FinancialReconciliationReason["MISSING_CAPTURED_AMOUNT"] = "MISSING_CAPTURED_AMOUNT";
    FinancialReconciliationReason["AMOUNT_MISMATCH"] = "AMOUNT_MISMATCH";
    FinancialReconciliationReason["CURRENCY_MISMATCH"] = "CURRENCY_MISMATCH";
    FinancialReconciliationReason["LEDGER_CONFLICT"] = "LEDGER_CONFLICT";
    FinancialReconciliationReason["PAYMENT_STATUS_UNSUPPORTED"] = "PAYMENT_STATUS_UNSUPPORTED";
    FinancialReconciliationReason["REFUND_STATE_AMBIGUOUS"] = "REFUND_STATE_AMBIGUOUS";
    FinancialReconciliationReason["RELATIONSHIP_CONFLICT"] = "RELATIONSHIP_CONFLICT";
    FinancialReconciliationReason["UNSUPPORTED_LEGACY_STATE"] = "UNSUPPORTED_LEGACY_STATE";
})(FinancialReconciliationReason || (exports.FinancialReconciliationReason = FinancialReconciliationReason = {}));
