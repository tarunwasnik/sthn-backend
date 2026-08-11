"use strict";
// backend/src/constants/internalProvider/providerSimulationMode.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderSimulationMode = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Simulation Mode
 * ------------------------------------------------------------------
 *
 * Represents the execution mode of the Internal Provider simulator.
 *
 * Simulation modes determine how the provider behaves when executing
 * operations. They are primarily used by the Admin Simulator,
 * automated testing, QA, and future chaos testing.
 *
 * NOTE:
 * This enum is ONLY used by the Internal Provider.
 * Real providers (Stripe, Razorpay, etc.) do not use simulation modes.
 * ------------------------------------------------------------------
 */
var ProviderSimulationMode;
(function (ProviderSimulationMode) {
    /**
     * Execute the normal successful provider flow.
     */
    ProviderSimulationMode["NORMAL"] = "NORMAL";
    /**
     * Introduce artificial processing delays.
     */
    ProviderSimulationMode["DELAY"] = "DELAY";
    /**
     * Simulate gateway timeout.
     */
    ProviderSimulationMode["TIMEOUT"] = "TIMEOUT";
    /**
     * Simulate provider network failure.
     */
    ProviderSimulationMode["NETWORK_ERROR"] = "NETWORK_ERROR";
    /**
     * Simulate provider service outage.
     */
    ProviderSimulationMode["PROVIDER_DOWN"] = "PROVIDER_DOWN";
    /**
     * Simulate provider rate limiting.
     */
    ProviderSimulationMode["RATE_LIMITED"] = "RATE_LIMITED";
    /**
     * Simulate temporary provider failure that can be retried.
     */
    ProviderSimulationMode["RETRYABLE_FAILURE"] = "RETRYABLE_FAILURE";
    /**
     * Simulate permanent provider failure.
     */
    ProviderSimulationMode["PERMANENT_FAILURE"] = "PERMANENT_FAILURE";
    /**
     * Simulate duplicate webhook delivery.
     */
    ProviderSimulationMode["DUPLICATE_WEBHOOK"] = "DUPLICATE_WEBHOOK";
    /**
     * Simulate webhook replay.
     */
    ProviderSimulationMode["WEBHOOK_REPLAY"] = "WEBHOOK_REPLAY";
    /**
     * Simulate out-of-order webhook delivery.
     */
    ProviderSimulationMode["OUT_OF_ORDER_WEBHOOK"] = "OUT_OF_ORDER_WEBHOOK";
    /**
     * Simulate partial capture.
     */
    ProviderSimulationMode["PARTIAL_CAPTURE"] = "PARTIAL_CAPTURE";
    /**
     * Simulate partial refund.
     */
    ProviderSimulationMode["PARTIAL_REFUND"] = "PARTIAL_REFUND";
    /**
     * Simulate partial settlement.
     */
    ProviderSimulationMode["PARTIAL_SETTLEMENT"] = "PARTIAL_SETTLEMENT";
    /**
     * Simulate payout reversal.
     */
    ProviderSimulationMode["PAYOUT_REVERSAL"] = "PAYOUT_REVERSAL";
    /**
     * Simulate manual administrator intervention.
     */
    ProviderSimulationMode["ADMIN_OVERRIDE"] = "ADMIN_OVERRIDE";
})(ProviderSimulationMode || (exports.ProviderSimulationMode = ProviderSimulationMode = {}));
exports.default = ProviderSimulationMode;
