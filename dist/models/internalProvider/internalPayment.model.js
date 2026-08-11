"use strict";
// backend/src/models/internalProvider/internalPayment.model.ts
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
const financialLimits_1 = require("../../constants/financial/financialLimits");
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const schemas_1 = require("./schemas");
const InternalPaymentSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * References
     * ==============================================================
     */
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
        immutable: true,
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
    },
    providerTransactionId: {
        type: String,
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
        immutable: true,
        trim: true,
    },
    amount: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Internal provider payment amount must be a safe integer minor-unit value.",
        },
    },
    currency: {
        type: String,
        required: true,
        immutable: true,
        uppercase: true,
        trim: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    requestFingerprint: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        select: false,
    },
    /**
     * ==============================================================
     * Provider State
     * ==============================================================
     */
    status: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderStatus),
        required: true,
        default: internalProvider_1.ProviderStatus.CREATED,
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
     *
     * Stores the raw provider request/response payloads.
     * These payloads are intentionally flexible because every
     * provider exposes different APIs and response formats.
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
     * Time when the provider authorized the payment.
     */
    authorizedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the provider successfully captured the payment.
     */
    capturedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payment was cancelled.
     */
    cancelledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payment failed.
     */
    failedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payment expired.
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
     * Minimize disabled so empty embedded provider objects
     * remain visible for debugging and auditing.
     */
    minimize: false,
    /**
     * Include virtual fields when serializing.
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
 * One provider record per Financial Domain payment.
 */
InternalPaymentSchema.index({ paymentId: 1 }, { unique: true });
/**
 * Provider payment lookup.
 */
InternalPaymentSchema.index({ providerPaymentId: 1 }, { unique: true });
/**
 * Provider transaction lookup.
 */
InternalPaymentSchema.index({ providerTransactionId: 1 }, {
    unique: true,
    partialFilterExpression: {
        providerTransactionId: { $type: "string" },
    },
});
/**
 * Duplicate request protection.
 */
InternalPaymentSchema.index({ idempotencyKey: 1 }, { unique: true });
/**
 * Active payment queries.
 */
InternalPaymentSchema.index({
    status: 1,
    isTerminal: 1,
});
/**
 * Provider reconciliation queries.
 */
InternalPaymentSchema.index({
    paymentId: 1,
    status: 1,
});
/**
 * Administrative timeline queries.
 */
InternalPaymentSchema.index({
    createdAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalPaymentModel = mongoose_1.default.model("InternalPayment", InternalPaymentSchema);
exports.default = InternalPaymentModel;
