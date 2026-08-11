"use strict";
// backend/src/constants/internalProvider/providerEventType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderEventType = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Event Type
 * ------------------------------------------------------------------
 *
 * Represents immutable events emitted by the Internal Provider.
 *
 * Every provider action generates one or more events which are stored
 * in InternalProviderEvent for auditing, replay, reconciliation,
 * debugging and timeline reconstruction.
 *
 * Provider events are append-only and MUST NEVER be modified.
 * ------------------------------------------------------------------
 */
var ProviderEventType;
(function (ProviderEventType) {
    ProviderEventType["CONVERSION_PROVIDER_CREATED"] = "CONVERSION_PROVIDER_CREATED";
    ProviderEventType["CONVERSION_PROVIDER_INITIALIZED"] = "CONVERSION_PROVIDER_INITIALIZED";
    ProviderEventType["CONVERSION_PROVIDER_PROCESSING"] = "CONVERSION_PROVIDER_PROCESSING";
    ProviderEventType["CONVERSION_PROVIDER_SUCCEEDED"] = "CONVERSION_PROVIDER_SUCCEEDED";
    ProviderEventType["CONVERSION_PROVIDER_FAILED"] = "CONVERSION_PROVIDER_FAILED";
    ProviderEventType["WITHDRAWAL_PROVIDER_CREATED"] = "WITHDRAWAL_PROVIDER_CREATED";
    ProviderEventType["WITHDRAWAL_PROVIDER_INITIALIZED"] = "WITHDRAWAL_PROVIDER_INITIALIZED";
    ProviderEventType["WITHDRAWAL_PROVIDER_PROCESSING"] = "WITHDRAWAL_PROVIDER_PROCESSING";
    ProviderEventType["WITHDRAWAL_PROVIDER_SUCCEEDED"] = "WITHDRAWAL_PROVIDER_SUCCEEDED";
    ProviderEventType["WITHDRAWAL_PROVIDER_FAILED"] = "WITHDRAWAL_PROVIDER_FAILED";
    ProviderEventType["TOP_UP_FUNDING_CREATED"] = "TOP_UP_FUNDING_CREATED";
    ProviderEventType["TOP_UP_FUNDING_PROCESSING_STARTED"] = "TOP_UP_FUNDING_PROCESSING_STARTED";
    ProviderEventType["TOP_UP_FUNDING_SUCCEEDED"] = "TOP_UP_FUNDING_SUCCEEDED";
    ProviderEventType["TOP_UP_FUNDING_FAILED"] = "TOP_UP_FUNDING_FAILED";
    /**
     * Payment Events
     */
    ProviderEventType["PAYMENT_CREATED"] = "PAYMENT_CREATED";
    ProviderEventType["PAYMENT_AUTHORIZED"] = "PAYMENT_AUTHORIZED";
    ProviderEventType["PAYMENT_CAPTURED"] = "PAYMENT_CAPTURED";
    ProviderEventType["PAYMENT_PARTIALLY_CAPTURED"] = "PAYMENT_PARTIALLY_CAPTURED";
    ProviderEventType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    ProviderEventType["PAYMENT_CANCELLED"] = "PAYMENT_CANCELLED";
    ProviderEventType["PAYMENT_EXPIRED"] = "PAYMENT_EXPIRED";
    /**
     * Refund Events
     */
    ProviderEventType["REFUND_CREATED"] = "REFUND_CREATED";
    ProviderEventType["REFUND_PROCESSING"] = "REFUND_PROCESSING";
    ProviderEventType["REFUND_COMPLETED"] = "REFUND_COMPLETED";
    ProviderEventType["REFUND_PARTIALLY_COMPLETED"] = "REFUND_PARTIALLY_COMPLETED";
    ProviderEventType["REFUND_FAILED"] = "REFUND_FAILED";
    ProviderEventType["REFUND_CANCELLED"] = "REFUND_CANCELLED";
    ProviderEventType["REFUND_EXPIRED"] = "REFUND_EXPIRED";
    /**
     * Settlement Events
     */
    ProviderEventType["SETTLEMENT_CREATED"] = "SETTLEMENT_CREATED";
    ProviderEventType["SETTLEMENT_SCHEDULED"] = "SETTLEMENT_SCHEDULED";
    ProviderEventType["SETTLEMENT_PROCESSING"] = "SETTLEMENT_PROCESSING";
    ProviderEventType["SETTLEMENT_PARTIALLY_COMPLETED"] = "SETTLEMENT_PARTIALLY_COMPLETED";
    ProviderEventType["SETTLEMENT_COMPLETED"] = "SETTLEMENT_COMPLETED";
    ProviderEventType["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    ProviderEventType["SETTLEMENT_CANCELLED"] = "SETTLEMENT_CANCELLED";
    ProviderEventType["SETTLEMENT_EXPIRED"] = "SETTLEMENT_EXPIRED";
    /**
     * Payout Events
     */
    ProviderEventType["PAYOUT_CREATED"] = "PAYOUT_CREATED";
    ProviderEventType["PAYOUT_SCHEDULED"] = "PAYOUT_SCHEDULED";
    ProviderEventType["PAYOUT_INITIATED"] = "PAYOUT_INITIATED";
    ProviderEventType["PAYOUT_PROCESSING"] = "PAYOUT_PROCESSING";
    ProviderEventType["PAYOUT_COMPLETED"] = "PAYOUT_COMPLETED";
    ProviderEventType["PAYOUT_PARTIALLY_COMPLETED"] = "PAYOUT_PARTIALLY_COMPLETED";
    ProviderEventType["PAYOUT_FAILED"] = "PAYOUT_FAILED";
    ProviderEventType["PAYOUT_CANCELLED"] = "PAYOUT_CANCELLED";
    ProviderEventType["PAYOUT_EXPIRED"] = "PAYOUT_EXPIRED";
    ProviderEventType["PAYOUT_REVERSED"] = "PAYOUT_REVERSED";
    /**
     * Webhook Events
     */
    ProviderEventType["WEBHOOK_RECEIVED"] = "WEBHOOK_RECEIVED";
    ProviderEventType["WEBHOOK_VALIDATING"] = "WEBHOOK_VALIDATING";
    ProviderEventType["WEBHOOK_VERIFIED"] = "WEBHOOK_VERIFIED";
    ProviderEventType["WEBHOOK_PROCESSING"] = "WEBHOOK_PROCESSING";
    ProviderEventType["WEBHOOK_PROCESSED"] = "WEBHOOK_PROCESSED";
    ProviderEventType["WEBHOOK_RETRIED"] = "WEBHOOK_RETRIED";
    ProviderEventType["WEBHOOK_REPLAYED"] = "WEBHOOK_REPLAYED";
    ProviderEventType["WEBHOOK_FAILED"] = "WEBHOOK_FAILED";
    ProviderEventType["WEBHOOK_REJECTED"] = "WEBHOOK_REJECTED";
    ProviderEventType["WEBHOOK_EXPIRED"] = "WEBHOOK_EXPIRED";
    /**
     * Provider Events
     */
    ProviderEventType["PROVIDER_TIMEOUT"] = "PROVIDER_TIMEOUT";
    ProviderEventType["PROVIDER_NETWORK_ERROR"] = "PROVIDER_NETWORK_ERROR";
    ProviderEventType["PROVIDER_RATE_LIMITED"] = "PROVIDER_RATE_LIMITED";
    ProviderEventType["PROVIDER_RETRY_SCHEDULED"] = "PROVIDER_RETRY_SCHEDULED";
    /**
     * Administrative Events
     */
    ProviderEventType["ADMIN_OVERRIDE"] = "ADMIN_OVERRIDE";
    ProviderEventType["ADMIN_SIMULATION"] = "ADMIN_SIMULATION";
    ProviderEventType["ADMIN_RESET"] = "ADMIN_RESET";
    /**
     * FX Events (Future Phase)
     */
    ProviderEventType["FX_RATE_IMPORTED"] = "FX_RATE_IMPORTED";
    ProviderEventType["FX_RATE_OVERRIDDEN"] = "FX_RATE_OVERRIDDEN";
    ProviderEventType["FX_CONVERSION_PERFORMED"] = "FX_CONVERSION_PERFORMED";
    /**
     * Reconciliation Events (Future Phase)
     */
    ProviderEventType["RECONCILIATION_STARTED"] = "RECONCILIATION_STARTED";
    ProviderEventType["RECONCILIATION_COMPLETED"] = "RECONCILIATION_COMPLETED";
    ProviderEventType["RECONCILIATION_FAILED"] = "RECONCILIATION_FAILED";
})(ProviderEventType || (exports.ProviderEventType = ProviderEventType = {}));
exports.default = ProviderEventType;
