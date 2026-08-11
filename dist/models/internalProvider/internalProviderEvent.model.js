"use strict";
// backend/src/models/internalProvider/internalProviderEvent.model.ts
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
const InternalProviderEventSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * Entity
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
    /**
     * ==============================================================
     * Event Information
     * ==============================================================
     */
    eventType: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderEventType),
        required: true,
        immutable: true,
        index: true,
    },
    operation: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderOperation),
        required: true,
        immutable: true,
        index: true,
    },
    transitionKey: {
        type: String,
        immutable: true,
        trim: true,
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
    providerEntityId: {
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
     * Event Timestamp
     * ==============================================================
     */
    /**
     * Time when the provider event occurred.
     *
     * This represents the business event time rather than the
     * document creation time and is immutable once recorded.
     */
    occurredAt: {
        type: Date,
        required: true,
        immutable: true,
        default: Date.now,
        index: true,
    },
}, {
    /**
     * Automatically maintain creation timestamp.
     *
     * Provider events are append-only and therefore
     * do not maintain an updatedAt timestamp.
     */
    timestamps: {
        createdAt: true,
        updatedAt: false,
    },
    /**
     * Disable Mongoose versioning.
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
 * Timeline for a provider entity.
 */
InternalProviderEventSchema.index({
    entityType: 1,
    entityId: 1,
    occurredAt: 1,
});
/**
 * A committed provider transition may have one matching immutable event.
 * The partial filter leaves historical missing/null values unindexed.
 */
InternalProviderEventSchema.index({ transitionKey: 1 }, {
    unique: true,
    partialFilterExpression: {
        transitionKey: { $type: "string" },
    },
});
/**
 * Event type queries.
 */
InternalProviderEventSchema.index({
    eventType: 1,
    occurredAt: -1,
});
/**
 * Operation queries.
 */
InternalProviderEventSchema.index({
    operation: 1,
    occurredAt: -1,
});
/**
 * Provider payment reconciliation.
 */
InternalProviderEventSchema.index({
    providerPaymentId: 1,
    occurredAt: -1,
});
/**
 * Provider entity timeline.
 */
InternalProviderEventSchema.index({
    providerEntityId: 1,
    occurredAt: -1,
});
/**
 * Complete provider audit trail.
 */
InternalProviderEventSchema.index({
    entityType: 1,
    entityId: 1,
    eventType: 1,
    occurredAt: -1,
});
/**
 * Administrative timeline.
 */
InternalProviderEventSchema.index({
    occurredAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalProviderEventModel = mongoose_1.default.model("InternalProviderEvent", InternalProviderEventSchema);
exports.default = InternalProviderEventModel;
