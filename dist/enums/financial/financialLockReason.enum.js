"use strict";
// backend/src/enums/financial/financialLockReason.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialLockReason = void 0;
/**
 * Canonical reasons for placing a financial lock on an entity.
 *
 * Financial locks prevent downstream financial operations until
 * the blocking condition has been resolved. These values are used
 * throughout the Financial Domain for validation, automation,
 * auditing, and reporting.
 */
var FinancialLockReason;
(function (FinancialLockReason) {
    /**
     * No active financial lock.
     */
    FinancialLockReason["NONE"] = "NONE";
    /**
     * Payment has not yet been settled.
     */
    FinancialLockReason["PAYMENT_PENDING"] = "PAYMENT_PENDING";
    /**
     * Settlement is still in progress.
     */
    FinancialLockReason["SETTLEMENT_PENDING"] = "SETTLEMENT_PENDING";
    /**
     * Refund is currently being processed.
     */
    FinancialLockReason["REFUND_PENDING"] = "REFUND_PENDING";
    /**
     * Booking is under dispute.
     */
    FinancialLockReason["DISPUTE_OPEN"] = "DISPUTE_OPEN";
    /**
     * Cooling period before payability has not completed.
     */
    FinancialLockReason["COOLING_PERIOD"] = "COOLING_PERIOD";
    /**
     * Booking has not yet become payable.
     */
    FinancialLockReason["NOT_PAYABLE"] = "NOT_PAYABLE";
    /**
     * Booking has not yet become payout eligible.
     */
    FinancialLockReason["NOT_PAYOUT_ELIGIBLE"] = "NOT_PAYOUT_ELIGIBLE";
    /**
     * Payout is currently being processed.
     */
    FinancialLockReason["PAYOUT_IN_PROGRESS"] = "PAYOUT_IN_PROGRESS";
    /**
     * Creator account is restricted from financial operations.
     */
    FinancialLockReason["CREATOR_RESTRICTED"] = "CREATOR_RESTRICTED";
    /**
     * Manual administrative hold.
     */
    FinancialLockReason["ADMIN_HOLD"] = "ADMIN_HOLD";
    /**
     * Financial reconciliation is in progress.
     */
    FinancialLockReason["RECONCILIATION"] = "RECONCILIATION";
    /**
     * Internal system validation or maintenance.
     */
    FinancialLockReason["SYSTEM"] = "SYSTEM";
})(FinancialLockReason || (exports.FinancialLockReason = FinancialLockReason = {}));
