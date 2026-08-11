"use strict";
// backend/src/constants/internalProvider/providerRefundStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRefundStatus = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Refund Status
 * ------------------------------------------------------------------
 *
 * Represents the lifecycle of a refund inside the payment provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain RefundStatus.
 *
 * Financial Domain:
 *      Refund.status
 *
 * Internal Provider:
 *      InternalRefund.providerStatus
 * ------------------------------------------------------------------
 */
var ProviderRefundStatus;
(function (ProviderRefundStatus) {
    /**
     * Refund request has been created.
     */
    ProviderRefundStatus["CREATED"] = "CREATED";
    /**
     * Refund has been accepted and is waiting for processing.
     */
    ProviderRefundStatus["PENDING"] = "PENDING";
    /**
     * Refund is currently being processed.
     */
    ProviderRefundStatus["PROCESSING"] = "PROCESSING";
    /**
     * Refund has been partially completed.
     */
    ProviderRefundStatus["PARTIALLY_REFUNDED"] = "PARTIALLY_REFUNDED";
    /**
     * Refund completed successfully.
     */
    ProviderRefundStatus["REFUNDED"] = "REFUNDED";
    /**
     * Refund failed.
     */
    ProviderRefundStatus["FAILED"] = "FAILED";
    /**
     * Refund was cancelled before completion.
     */
    ProviderRefundStatus["CANCELLED"] = "CANCELLED";
    /**
     * Refund request expired.
     */
    ProviderRefundStatus["EXPIRED"] = "EXPIRED";
})(ProviderRefundStatus || (exports.ProviderRefundStatus = ProviderRefundStatus = {}));
exports.default = ProviderRefundStatus;
