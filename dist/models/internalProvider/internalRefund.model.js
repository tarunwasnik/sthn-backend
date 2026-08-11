"use strict";
// backend/src/models/internalProvider/internalRefund.model.ts
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
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../../constants/financial/financialLimits");
const schemas_1 = require("./schemas");
const InternalRefundSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * References
     * ==============================================================
     */
    refundId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Refund",
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
    providerRefundId: {
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
    requestFingerprint: { type: String, immutable: true, trim: true, select: false },
    amount: { type: Number, required: true, immutable: true, min: 1, max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: (value) => Number.isSafeInteger(value), message: "Provider refund amount must be a safe integer." } },
    currency: { type: String, required: true, immutable: true, uppercase: true, trim: true, enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    /**
     * ==============================================================
     * Provider State
     * ==============================================================
     */
    status: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderRefundStatus),
        default: internalProvider_1.ProviderRefundStatus.CREATED,
        required: true,
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
     * Time when refund processing started.
     */
    processingStartedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when refund completed successfully.
     */
    completedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when refund was cancelled.
     */
    cancelledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when refund failed.
     */
    failedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when refund expired.
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
 * One provider refund per Financial Domain refund.
 */
InternalRefundSchema.index({ refundId: 1 }, { unique: true });
/**
 * Parent provider payment lookup.
 */
InternalRefundSchema.index({
    internalPaymentId: 1,
});
/**
 * Provider payment lookup.
 */
InternalRefundSchema.index({
    providerPaymentId: 1,
});
/**
 * Provider refund lookup.
 */
InternalRefundSchema.index({ providerRefundId: 1 }, { unique: true });
/**
 * Duplicate request protection.
 */
InternalRefundSchema.index({ idempotencyKey: 1 }, { unique: true });
/**
 * Active refund queries.
 */
InternalRefundSchema.index({
    status: 1,
    isTerminal: 1,
});
/**
 * Reconciliation queries.
 */
InternalRefundSchema.index({
    providerPaymentId: 1,
    status: 1,
});
/**
 * Administrative timeline queries.
 */
InternalRefundSchema.index({
    createdAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalRefundModel = mongoose_1.default.model("InternalRefund", InternalRefundSchema);
exports.default = InternalRefundModel;
