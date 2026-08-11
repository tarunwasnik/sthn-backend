"use strict";
// backend/src/enums/financial/payoutStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayoutStatus = void 0;
/**
 * Represents the lifecycle of a creator payout.
 *
 * A payout transfers eligible creator earnings from the marketplace
 * to the creator. Payouts are generated only after all financial
 * eligibility requirements have been satisfied.
 */
var PayoutStatus;
(function (PayoutStatus) {
    /**
     * Payout record has been created.
     */
    PayoutStatus["CREATED"] = "CREATED";
    /**
     * Waiting to enter payout processing.
     */
    PayoutStatus["PENDING"] = "PENDING";
    /**
     * Payout has been queued for execution.
     */
    PayoutStatus["QUEUED"] = "QUEUED";
    /**
     * Payout is currently being processed.
     */
    PayoutStatus["PROCESSING"] = "PROCESSING";
    /**
     * Payout completed successfully.
     */
    PayoutStatus["COMPLETED"] = "COMPLETED";
    /**
     * Payout failed and may be retried.
     */
    PayoutStatus["FAILED"] = "FAILED";
    /**
     * Payout has been cancelled.
     */
    PayoutStatus["CANCELLED"] = "CANCELLED";
    /**
     * Payout is temporarily on hold.
     */
    PayoutStatus["ON_HOLD"] = "ON_HOLD";
    /**
     * Payout has been reversed after completion.
     */
    PayoutStatus["REVERSED"] = "REVERSED";
})(PayoutStatus || (exports.PayoutStatus = PayoutStatus = {}));
