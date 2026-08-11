"use strict";
// backend/src/models/internalProvider/internalWebhook.model.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const internalProvider_1 = require("../../constants/internalProvider");
const schemas_1 = require("./schemas");
const InternalWebhookSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * Entity Reference
     * ==============================================================
     */
    entityType: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderEntityType),
        required: true,
        immutable: true,
        index: true,
    },
    entityId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        immutable: true,
        index: true,
    },
    providerEntityId: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        index: true,
    },
    /**
     * ==============================================================
     * Provider Identifiers
     * ==============================================================
     */
    providerPaymentId: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        index: true,
    },
    providerWebhookId: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
    },
    eventName: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        index: true,
    },
    providerReference: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
    },
    /**
     * ==============================================================
     * Processing State
     * ==============================================================
     */
    status: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderWebhookStatus),
        required: true,
        default: internalProvider_1.ProviderWebhookStatus.CREATED,
        index: true,
    },
    failureReason: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderFailureReason),
        default: null,
    },
    isTerminal: {
        type: Boolean,
        required: true,
        default: false,
        index: true,
    },
    /**
     * ==============================================================
     * Provider Metadata
     * ==============================================================
     */
    providerMetadata: {
        type: schemas_1.ProviderMetadataSchema,
        required: true,
        default: () => ({}),
    },
    /**
     * ==============================================================
     * Execution Information
     * ==============================================================
     */
    execution: {
        type: schemas_1.ProviderExecutionSchema,
        required: true,
        default: () => ({}),
    },
    /**
     * ==============================================================
     * Audit Information
     * ==============================================================
     */
    audit: {
        type: schemas_1.ProviderAuditSchema,
        required: true,
        default: () => ({}),
    },
    /**
     * ==============================================================
     * Provider Payloads
     * ==============================================================
     */
    payloads: {
        type: schemas_1.ProviderPayloadSchema,
        required: true,
        default: () => ({}),
    },
    /**
     * ==============================================================
     * Webhook Processing Lifecycle
     * ==============================================================
     *
     * CREATED
     * ↓
     * RECEIVED
     * ↓
     * VALIDATING
     * ↓
     * VERIFIED
     * ↓
     * PROCESSING
     * ↓
     * PROCESSED
     *
     * Terminal paths:
     * - FAILED
     * - REJECTED
     * - EXPIRED
     *
     * Recovery paths:
     * - RETRYING
     * - REPLAYED
     */
    /**
     * Time when the webhook was received.
     */
    receivedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when validation started.
     */
    validatedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when validation completed successfully.
     */
    verifiedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when webhook processing started.
     */
    processingAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when webhook processing completed.
     */
    processedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the webhook entered retry.
     */
    retriedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the webhook was replayed.
     */
    replayedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when processing permanently failed.
     */
    failedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the webhook was rejected.
     */
    rejectedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the webhook expired.
     */
    expiredAt: {
        type: Date,
        default: null,
    },
}, {
    /**
     * Automatically maintain creation/update timestamps.
     */
    timestamps: true,
    /**
     * Disable Mongoose version key.
     */
    versionKey: false,
    /**
     * Preserve empty embedded provider objects.
     */
    minimize: false,
    /**
     * Include virtuals during serialization.
     */
    toJSON: {
        virtuals: true,
    },
    toObject: {
        virtuals: true,
    },
});
/**
 * ==============================================================
 * Indexes
 * ==============================================================
 */
/**
 * Generic entity lookup.
 */
InternalWebhookSchema.index({
    entityType: 1,
    entityId: 1,
});
/**
 * Provider entity lookup.
 */
InternalWebhookSchema.index({
    providerEntityId: 1,
});
/**
 * Provider payment reconciliation.
 */
InternalWebhookSchema.index({
    providerPaymentId: 1,
});
/**
 * Provider webhook lookup.
 */
InternalWebhookSchema.index({ providerWebhookId: 1 }, { unique: true });
/**
 * Event name queries.
 */
InternalWebhookSchema.index({
    eventName: 1,
});
/**
 * Duplicate webhook protection.
 */
InternalWebhookSchema.index({ idempotencyKey: 1 }, { unique: true });
/**
 * Active webhook deliveries.
 */
InternalWebhookSchema.index({
    status: 1,
    isTerminal: 1,
});
/**
 * Entity event history.
 */
InternalWebhookSchema.index({
    entityType: 1,
    entityId: 1,
    createdAt: -1,
});
/**
 * Administrative timeline.
 */
InternalWebhookSchema.index({
    createdAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalWebhookModel = mongoose_1.default.model("InternalWebhook", InternalWebhookSchema);
exports.default = InternalWebhookModel;
