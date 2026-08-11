"use strict";
// backend/src/constants/internalProvider/providerEntityType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderEntityType = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Entity Type
 * ------------------------------------------------------------------
 *
 * Represents the supported provider-managed entity types.
 *
 * This enum is used wherever provider entities need to be referenced
 * generically instead of working with a specific model.
 *
 * Typical use cases:
 * - InternalProviderEvent
 * - Audit Logs
 * - Reconciliation Engine
 * - Admin Simulator
 * - Generic Provider Services
 * - Reporting & Analytics
 *
 * NOTE:
 * This enum identifies provider entities only.
 * It does NOT represent operations, statuses, or events.
 * ------------------------------------------------------------------
 */
var ProviderEntityType;
(function (ProviderEntityType) {
    ProviderEntityType["WALLET_CONVERSION_PROVIDER_REQUEST"] = "WALLET_CONVERSION_PROVIDER_REQUEST";
    ProviderEntityType["WITHDRAWAL_PROVIDER_REQUEST"] = "WITHDRAWAL_PROVIDER_REQUEST";
    /**
     * Provider payment entity.
     */
    ProviderEntityType["PAYMENT"] = "PAYMENT";
    /**
     * Provider refund entity.
     */
    ProviderEntityType["REFUND"] = "REFUND";
    /**
     * Provider settlement entity.
     */
    ProviderEntityType["SETTLEMENT"] = "SETTLEMENT";
    /**
     * Provider payout entity.
     */
    ProviderEntityType["PAYOUT"] = "PAYOUT";
    /**
     * Provider webhook entity.
     */
    ProviderEntityType["WEBHOOK"] = "WEBHOOK";
    /**
     * Immutable provider event entity.
     */
    ProviderEntityType["EVENT"] = "EVENT";
    ProviderEntityType["TOP_UP_FUNDING"] = "TOP_UP_FUNDING";
})(ProviderEntityType || (exports.ProviderEntityType = ProviderEntityType = {}));
exports.default = ProviderEntityType;
