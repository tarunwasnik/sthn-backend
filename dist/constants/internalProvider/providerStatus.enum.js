"use strict";
// backend/src/constants/internalProvider/providerStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderStatus = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payment Status
 * ------------------------------------------------------------------
 *
 * Represents the lifecycle of a payment inside the payment provider.
 *
 * This enum is provider-specific and MUST NOT be confused with the
 * Financial Domain PaymentStatus.
 *
 * Financial Domain:
 *      Payment.status
 *
 * Internal Provider:
 *      InternalPayment.providerStatus
 *
 * The Financial Domain consumes provider responses but remains
 * independent of provider-specific state transitions.
 * ------------------------------------------------------------------
 */
var ProviderStatus;
(function (ProviderStatus) {
    /**
     * Payment record has been created by the provider.
     */
    ProviderStatus["CREATED"] = "CREATED";
    /**
     * Funds have been authorized but not yet captured.
     */
    ProviderStatus["AUTHORIZED"] = "AUTHORIZED";
    /**
     * A portion of the authorized amount has been captured.
     */
    ProviderStatus["PARTIALLY_CAPTURED"] = "PARTIALLY_CAPTURED";
    /**
     * Full payment amount has been captured.
     */
    ProviderStatus["CAPTURED"] = "CAPTURED";
    /**
     * Payment is awaiting settlement.
     */
    ProviderStatus["SETTLEMENT_PENDING"] = "SETTLEMENT_PENDING";
    /**
     * Settlement has been completed successfully.
     */
    ProviderStatus["SETTLED"] = "SETTLED";
    /**
     * Payment has been partially refunded.
     */
    ProviderStatus["PARTIALLY_REFUNDED"] = "PARTIALLY_REFUNDED";
    /**
     * Payment has been fully refunded.
     */
    ProviderStatus["REFUNDED"] = "REFUNDED";
    /**
     * Provider rejected or failed the payment.
     */
    ProviderStatus["FAILED"] = "FAILED";
    /**
     * Payment was cancelled before completion.
     */
    ProviderStatus["CANCELLED"] = "CANCELLED";
    /**
     * Authorization or payment expired before capture.
     */
    ProviderStatus["EXPIRED"] = "EXPIRED";
})(ProviderStatus || (exports.ProviderStatus = ProviderStatus = {}));
exports.default = ProviderStatus;
