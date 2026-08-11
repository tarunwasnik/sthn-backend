"use strict";
// backend/src/models/internalProvider/internalSettlement.model.ts
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
const InternalSettlementSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * References
     * ==============================================================
     */
    settlementId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Settlement",
        required: true,
        immutable: true,
        index: true,
    },
    internalPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "InternalPayment",
        required: true,
        immutable: true,
        index: true,
    },
    /**
     * ==============================================================
     * Provider Identifiers
     * ==============================================================
     */
    providerPaymentId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        index: true,
    },
    providerSettlementId: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
    },
    providerReference: {
        type: String,
        default: null,
        trim: true,
        immutable: true,
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
     * Provider State
     * ==============================================================
     */
    status: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderSettlementStatus),
        required: true,
        default: internalProvider_1.ProviderSettlementStatus.CREATED,
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
     * Lifecycle Timestamps
     * ==============================================================
     */
    /**
     * Time when settlement was scheduled.
     */
    scheduledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when settlement processing began.
     */
    processingAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when settlement completed successfully.
     */
    settledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when settlement failed.
     */
    failedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when settlement was cancelled.
     */
    cancelledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when settlement expired.
     */
    expiredAt: {
        type: Date,
        default: null,
    },
}, {
    /**
     * Automatically maintain createdAt and updatedAt.
     */
    timestamps: true,
    /**
     * Disable Mongoose versioning.
     */
    versionKey: false,
    /**
     * Preserve empty embedded provider objects.
     */
    minimize: false,
    /**
     * Include virtuals when serializing.
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
 * One provider settlement per Financial Domain settlement.
 */
InternalSettlementSchema.index({ settlementId: 1 }, { unique: true });
/**
 * Parent provider payment lookup.
 */
InternalSettlementSchema.index({
    internalPaymentId: 1,
});
/**
 * Provider payment reconciliation lookup.
 */
InternalSettlementSchema.index({
    providerPaymentId: 1,
});
/**
 * Provider settlement lookup.
 */
InternalSettlementSchema.index({ providerSettlementId: 1 }, { unique: true });
/**
 * Duplicate request protection.
 */
InternalSettlementSchema.index({ idempotencyKey: 1 }, { unique: true });
/**
 * Active settlement queries.
 */
InternalSettlementSchema.index({
    status: 1,
    isTerminal: 1,
});
/**
 * Provider reconciliation queries.
 */
InternalSettlementSchema.index({
    providerPaymentId: 1,
    status: 1,
});
/**
 * Administrative timeline queries.
 */
InternalSettlementSchema.index({
    createdAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalSettlementModel = mongoose_1.default.model("InternalSettlement", InternalSettlementSchema);
exports.default = InternalSettlementModel;
