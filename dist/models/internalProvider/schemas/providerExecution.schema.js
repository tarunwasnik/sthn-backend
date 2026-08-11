"use strict";
//backend/src/models/internalProvider/schemas/providerExecution.schema.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderExecutionSchema = void 0;
const mongoose_1 = require("mongoose");
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Execution Schema
 * ------------------------------------------------------------------
 *
 * Stores execution metrics produced while processing a provider
 * operation.
 *
 * These values are primarily used for diagnostics, retries,
 * monitoring, reconciliation and analytics.
 * ------------------------------------------------------------------
 */
exports.ProviderExecutionSchema = new mongoose_1.Schema({
    /**
     * Current execution attempt.
     */
    attemptNumber: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
    },
    /**
     * Number of retries already performed.
     */
    retryCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    /**
     * Total processing latency in milliseconds.
     */
    processingLatencyMs: {
        type: Number,
        default: null,
        min: 0,
    },
    /**
     * Indicates whether execution occurred
     * in test mode.
     */
    isTestMode: {
        type: Boolean,
        required: true,
        default: true,
    },
}, {
    _id: false,
});
exports.default = exports.ProviderExecutionSchema;
