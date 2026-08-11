"use strict";
// backend/src/constants/internalProvider/providerFailureReason.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFailureReason = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Failure Reason
 * ------------------------------------------------------------------
 *
 * Represents the reason why a provider operation failed.
 *
 * This enum supplements ProviderStatus and ProviderEventType by
 * providing the underlying cause of a failure.
 *
 * It is used by:
 * - Internal Provider
 * - Admin Simulator
 * - Retry Engine
 * - Audit Logs
 * - Reconciliation
 * - Future Real Providers
 * ------------------------------------------------------------------
 */
var ProviderFailureReason;
(function (ProviderFailureReason) {
    /**
     * Generic unknown failure.
     */
    ProviderFailureReason["UNKNOWN"] = "UNKNOWN";
    /**
     * Payment authorization was declined.
     */
    ProviderFailureReason["AUTHORIZATION_DECLINED"] = "AUTHORIZATION_DECLINED";
    /**
     * Payment capture failed.
     */
    ProviderFailureReason["CAPTURE_FAILED"] = "CAPTURE_FAILED";
    /**
     * Refund processing failed.
     */
    ProviderFailureReason["REFUND_FAILED"] = "REFUND_FAILED";
    /**
     * Settlement processing failed.
     */
    ProviderFailureReason["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    /**
     * Payout processing failed.
     */
    ProviderFailureReason["PAYOUT_FAILED"] = "PAYOUT_FAILED";
    /**
     * Provider service is unavailable.
     */
    ProviderFailureReason["PROVIDER_UNAVAILABLE"] = "PROVIDER_UNAVAILABLE";
    /**
     * Provider request timed out.
     */
    ProviderFailureReason["TIMEOUT"] = "TIMEOUT";
    /**
     * Network communication failed.
     */
    ProviderFailureReason["NETWORK_ERROR"] = "NETWORK_ERROR";
    /**
     * Provider rate limit exceeded.
     */
    ProviderFailureReason["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    /**
     * Duplicate operation detected.
     */
    ProviderFailureReason["DUPLICATE_REQUEST"] = "DUPLICATE_REQUEST";
    /**
     * Invalid idempotency key.
     */
    ProviderFailureReason["IDEMPOTENCY_CONFLICT"] = "IDEMPOTENCY_CONFLICT";
    /**
     * Invalid request payload.
     */
    ProviderFailureReason["INVALID_REQUEST"] = "INVALID_REQUEST";
    /**
     * Requested resource was not found.
     */
    ProviderFailureReason["RESOURCE_NOT_FOUND"] = "RESOURCE_NOT_FOUND";
    /**
     * Currency conversion failed.
     */
    ProviderFailureReason["FX_CONVERSION_FAILED"] = "FX_CONVERSION_FAILED";
    /**
     * Currency pair is unsupported.
     */
    ProviderFailureReason["UNSUPPORTED_CURRENCY"] = "UNSUPPORTED_CURRENCY";
    /**
     * Webhook signature verification failed.
     */
    ProviderFailureReason["INVALID_WEBHOOK_SIGNATURE"] = "INVALID_WEBHOOK_SIGNATURE";
    /**
     * Webhook payload is invalid.
     */
    ProviderFailureReason["INVALID_WEBHOOK_PAYLOAD"] = "INVALID_WEBHOOK_PAYLOAD";
    /**
     * Webhook arrived in an unexpected order.
     */
    ProviderFailureReason["OUT_OF_ORDER_WEBHOOK"] = "OUT_OF_ORDER_WEBHOOK";
    /**
     * Webhook has already been processed.
     */
    ProviderFailureReason["DUPLICATE_WEBHOOK"] = "DUPLICATE_WEBHOOK";
    /**
     * Administrative cancellation.
     */
    ProviderFailureReason["ADMIN_CANCELLED"] = "ADMIN_CANCELLED";
    /**
     * Administrative override.
     */
    ProviderFailureReason["ADMIN_OVERRIDE"] = "ADMIN_OVERRIDE";
})(ProviderFailureReason || (exports.ProviderFailureReason = ProviderFailureReason = {}));
exports.default = ProviderFailureReason;
