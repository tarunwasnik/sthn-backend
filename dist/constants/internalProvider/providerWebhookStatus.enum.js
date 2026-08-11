"use strict";
// backend/src/constants/internalProvider/providerWebhookStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderWebhookStatus = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Webhook Status
 * ------------------------------------------------------------------
 *
 * Represents the processing lifecycle of an incoming provider webhook.
 *
 * This enum is provider-specific and MUST NOT be confused with any
 * Financial Domain status.
 *
 * Internal Provider:
 *      InternalWebhook.status
 *
 * A webhook may be delivered multiple times, replayed, delayed, or
 * arrive out of order. This status tracks the lifecycle of webhook
 * processing inside the simulator.
 * ------------------------------------------------------------------
 */
var ProviderWebhookStatus;
(function (ProviderWebhookStatus) {
    /**
     * Webhook record has been created.
     */
    ProviderWebhookStatus["CREATED"] = "CREATED";
    /**
     * Webhook has been received from the provider.
     */
    ProviderWebhookStatus["RECEIVED"] = "RECEIVED";
    /**
     * Signature validation is in progress.
     */
    ProviderWebhookStatus["VALIDATING"] = "VALIDATING";
    /**
     * Signature has been verified.
     */
    ProviderWebhookStatus["VERIFIED"] = "VERIFIED";
    /**
     * Webhook is currently being processed.
     */
    ProviderWebhookStatus["PROCESSING"] = "PROCESSING";
    /**
     * Processing completed successfully.
     */
    ProviderWebhookStatus["PROCESSED"] = "PROCESSED";
    /**
     * Webhook has been queued for retry.
     */
    ProviderWebhookStatus["RETRYING"] = "RETRYING";
    /**
     * Webhook has been replayed manually or automatically.
     */
    ProviderWebhookStatus["REPLAYED"] = "REPLAYED";
    /**
     * Processing failed.
     */
    ProviderWebhookStatus["FAILED"] = "FAILED";
    /**
     * Signature verification failed.
     */
    ProviderWebhookStatus["REJECTED"] = "REJECTED";
    /**
     * Webhook processing expired.
     */
    ProviderWebhookStatus["EXPIRED"] = "EXPIRED";
})(ProviderWebhookStatus || (exports.ProviderWebhookStatus = ProviderWebhookStatus = {}));
exports.default = ProviderWebhookStatus;
