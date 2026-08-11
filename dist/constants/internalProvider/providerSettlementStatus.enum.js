"use strict";
// backend/src/constants/internalProvider/providerSettlementStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderSettlementStatus = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Settlement Status
 * ------------------------------------------------------------------
 *
 * Represents the settlement lifecycle maintained by the payment
 * provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain SettlementStatus.
 *
 * Financial Domain:
 *      Settlement.status
 *
 * Internal Provider:
 *      InternalSettlement.providerStatus
 * ------------------------------------------------------------------
 */
var ProviderSettlementStatus;
(function (ProviderSettlementStatus) {
    /**
     * Settlement record has been created.
     */
    ProviderSettlementStatus["CREATED"] = "CREATED";
    /**
     * Settlement has been scheduled.
     */
    ProviderSettlementStatus["SCHEDULED"] = "SCHEDULED";
    /**
     * Settlement is waiting to be processed.
     */
    ProviderSettlementStatus["PENDING"] = "PENDING";
    /**
     * Settlement is currently being processed.
     */
    ProviderSettlementStatus["PROCESSING"] = "PROCESSING";
    /**
     * Settlement has been partially completed.
     */
    ProviderSettlementStatus["PARTIALLY_SETTLED"] = "PARTIALLY_SETTLED";
    /**
     * Settlement completed successfully.
     */
    ProviderSettlementStatus["SETTLED"] = "SETTLED";
    /**
     * Settlement failed.
     */
    ProviderSettlementStatus["FAILED"] = "FAILED";
    /**
     * Settlement was cancelled.
     */
    ProviderSettlementStatus["CANCELLED"] = "CANCELLED";
    /**
     * Settlement expired before completion.
     */
    ProviderSettlementStatus["EXPIRED"] = "EXPIRED";
})(ProviderSettlementStatus || (exports.ProviderSettlementStatus = ProviderSettlementStatus = {}));
exports.default = ProviderSettlementStatus;
