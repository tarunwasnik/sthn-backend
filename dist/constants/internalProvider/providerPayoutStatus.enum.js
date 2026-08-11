"use strict";
// backend/src/constants/internalProvider/providerPayoutStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderPayoutStatus = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payout Status
 * ------------------------------------------------------------------
 *
 * Represents the payout lifecycle maintained by the payment
 * provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain PayoutStatus.
 *
 * Financial Domain:
 *      Payout.status
 *
 * Internal Provider:
 *      InternalPayout.providerStatus
 * ------------------------------------------------------------------
 */
var ProviderPayoutStatus;
(function (ProviderPayoutStatus) {
    /**
     * Payout has been created.
     */
    ProviderPayoutStatus["CREATED"] = "CREATED";
    /**
     * Payout has been scheduled.
     */
    ProviderPayoutStatus["SCHEDULED"] = "SCHEDULED";
    /**
     * Payout is waiting to be processed.
     */
    ProviderPayoutStatus["PENDING"] = "PENDING";
    /**
     * Payout is currently being processed.
     */
    ProviderPayoutStatus["PROCESSING"] = "PROCESSING";
    /**
     * Payout has been initiated to the destination account.
     */
    ProviderPayoutStatus["INITIATED"] = "INITIATED";
    /**
     * A portion of the payout has been completed.
     */
    ProviderPayoutStatus["PARTIALLY_PAID"] = "PARTIALLY_PAID";
    /**
     * Payout completed successfully.
     */
    ProviderPayoutStatus["PAID"] = "PAID";
    /**
     * Payout failed.
     */
    ProviderPayoutStatus["FAILED"] = "FAILED";
    /**
     * Payout was cancelled.
     */
    ProviderPayoutStatus["CANCELLED"] = "CANCELLED";
    /**
     * Payout expired before completion.
     */
    ProviderPayoutStatus["EXPIRED"] = "EXPIRED";
    /**
     * Funds were returned back to the platform/provider.
     */
    ProviderPayoutStatus["REVERSED"] = "REVERSED";
})(ProviderPayoutStatus || (exports.ProviderPayoutStatus = ProviderPayoutStatus = {}));
exports.default = ProviderPayoutStatus;
