"use strict";
//backend/src/models/internalProvider/schemas/providerMetadata.schema.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderMetadataSchema = void 0;
const mongoose_1 = require("mongoose");
const internalProvider_1 = require("../../../constants/internalProvider");
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Metadata Schema
 * ------------------------------------------------------------------
 *
 * Describes the provider environment in which an operation was
 * executed.
 *
 * This schema identifies the execution context and should not be
 * confused with gateway request or response payloads.
 * ------------------------------------------------------------------
 */
exports.ProviderMetadataSchema = new mongoose_1.Schema({
    /**
     * Provider identifier.
     *
     * Examples:
     * INTERNAL
     * STRIPE
     * RAZORPAY
     */
    provider: {
        type: String,
        required: true,
        trim: true,
        default: "INTERNAL",
    },
    /**
     * Environment where execution occurred.
     *
     * Examples:
     * development
     * testing
     * staging
     * production
     */
    environment: {
        type: String,
        required: true,
        trim: true,
        default: process.env.NODE_ENV ?? "development",
    },
    /**
     * Provider API version.
     */
    apiVersion: {
        type: String,
        default: null,
        trim: true,
    },
    /**
     * Simulation mode.
     */
    simulationMode: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderSimulationMode),
        required: true,
        default: internalProvider_1.ProviderSimulationMode.NORMAL,
    },
    /**
     * Correlation identifier used across
     * provider operations.
     */
    correlationId: {
        type: String,
        default: null,
        trim: true,
    },
    /**
     * External provider request identifier.
     */
    requestId: {
        type: String,
        default: null,
        trim: true,
    },
}, {
    _id: false,
});
exports.default = exports.ProviderMetadataSchema;
