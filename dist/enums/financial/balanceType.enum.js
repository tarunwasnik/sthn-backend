"use strict";
// backend/src/enums/financial/balanceType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceType = void 0;
/**
 * Represents the different balance buckets maintained by the
 * Financial Domain for creators.
 *
 * Balances are derived from immutable ledger entries and must
 * never be updated by directly calculating from payments.
 */
var BalanceType;
(function (BalanceType) {
    /**
     * Earnings that are awaiting settlement or payability.
     */
    BalanceType["PENDING"] = "PENDING";
    /**
     * Earnings currently locked by financial rules.
     */
    BalanceType["LOCKED"] = "LOCKED";
    /**
     * Earnings available for payout.
     */
    BalanceType["AVAILABLE"] = "AVAILABLE";
    /**
     * Earnings currently queued for payout processing.
     */
    BalanceType["PAYOUT_PENDING"] = "PAYOUT_PENDING";
    /**
     * Earnings that have already been paid out.
     */
    BalanceType["PAID_OUT"] = "PAID_OUT";
    /**
     * Lifetime gross earnings.
     */
    BalanceType["LIFETIME_GROSS"] = "LIFETIME_GROSS";
    /**
     * Lifetime net earnings after deductions.
     */
    BalanceType["LIFETIME_NET"] = "LIFETIME_NET";
    /**
     * Lifetime platform commission deducted from creator earnings.
     */
    BalanceType["LIFETIME_COMMISSION"] = "LIFETIME_COMMISSION";
    /**
     * Lifetime refunded amount affecting creator earnings.
     */
    BalanceType["LIFETIME_REFUNDED"] = "LIFETIME_REFUNDED";
})(BalanceType || (exports.BalanceType = BalanceType = {}));
