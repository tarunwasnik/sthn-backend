"use strict";
// backend/src/models/internalProvider/internalPayout.model.ts
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
const payoutDestinationType_enum_1 = require("../../enums/financial/payoutDestinationType.enum");
const schemas_1 = require("./schemas");
const EncryptedProviderDestinationPayloadSchema = new mongoose_1.Schema({
    version: { type: Number, required: true, enum: [1], immutable: true },
    ciphertext: { type: String, required: true, immutable: true },
    iv: { type: String, required: true, immutable: true },
    authTag: { type: String, required: true, immutable: true },
}, { _id: false });
const ProviderDestinationSchema = new mongoose_1.Schema({
    version: { type: Number, required: true, enum: [1], immutable: true },
    sourceSnapshotVersion: { type: Number, required: true, enum: [1], immutable: true },
    destinationReference: { type: String, required: true, trim: true, immutable: true },
    type: { type: String, required: true, enum: Object.values(payoutDestinationType_enum_1.PayoutDestinationType), immutable: true },
    maskedIdentifier: { type: String, required: true, trim: true, immutable: true },
    accountNumberLast4: { type: String, immutable: true },
    ifscDisplay: { type: String, immutable: true, uppercase: true },
    fingerprint: { type: String, required: true, immutable: true, select: false, match: /^[a-f0-9]{64}$/ },
    encryptedPayload: { type: EncryptedProviderDestinationPayloadSchema, required: true, immutable: true, select: false },
}, { _id: false });
const InternalPayoutSchema = new mongoose_1.Schema({
    /**
     * ==============================================================
     * References
     * ==============================================================
     */
    payoutId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payout",
        required: true,
        immutable: true,
        index: true,
    },
    internalPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "InternalPayment",
        immutable: true,
        index: true,
    },
    internalSettlementId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "InternalSettlement",
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
        immutable: true,
        trim: true,
        index: true,
    },
    providerSettlementId: {
        type: String,
        immutable: true,
        trim: true,
        index: true,
    },
    providerPayoutId: {
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
    providerTransactionId: {
        type: String,
        default: null,
        trim: true,
        index: true,
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
        enum: Object.values(internalProvider_1.ProviderPayoutStatus),
        required: true,
        default: internalProvider_1.ProviderPayoutStatus.CREATED,
        index: true,
    },
    failureReason: {
        type: String,
        enum: Object.values(internalProvider_1.ProviderFailureReason),
        default: null,
    },
    failureCode: {
        type: String,
        default: null,
        trim: true,
        maxlength: 64,
    },
    failureMessage: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500,
    },
    simulated: {
        type: Boolean,
        default: false,
    },
    simulatedAction: {
        type: String,
        default: null,
        trim: true,
    },
    simulatedAt: {
        type: Date,
        default: null,
    },
    simulatedByAdminId: {
        type: String,
        default: null,
        trim: true,
    },
    simulationNote: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500,
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
    providerDestination: {
        type: ProviderDestinationSchema,
        immutable: true,
    },
    /**
     * ==============================================================
     * Lifecycle Timestamps
     * ==============================================================
     */
    /**
     * Time when the payout was scheduled.
     */
    scheduledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when payout processing began.
     */
    processingAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payout completed successfully.
     */
    paidAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payout failed.
     */
    failedAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payout was cancelled.
     */
    cancelledAt: {
        type: Date,
        default: null,
    },
    /**
     * Time when the payout expired.
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
     * Include virtuals during serialization.
     */
    toJSON: {
        virtuals: true,
    },
    toObject: {
        virtuals: true,
    },
});
InternalPayoutSchema.pre("validate", function () {
    const destination = this.providerDestination;
    if (!destination)
        return;
    if (destination.version !== 1 || destination.sourceSnapshotVersion !== 1) {
        throw new Error("Internal payout destination is invalid.");
    }
    if (destination.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT) {
        if (!/^\d{4}$/.test(destination.accountNumberLast4 ?? "") ||
            !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(destination.ifscDisplay ?? "") ||
            destination.maskedIdentifier !== `••••${destination.accountNumberLast4}`) {
            throw new Error("Internal payout bank destination is invalid.");
        }
    }
    else if (destination.type === payoutDestinationType_enum_1.PayoutDestinationType.UPI) {
        if (destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined) {
            throw new Error("Internal payout UPI destination is invalid.");
        }
    }
    else {
        throw new Error("Internal payout destination type is invalid.");
    }
});
/**
 * ==============================================================
 * Indexes
 * ==============================================================
 */
/**
 * One provider payout per Financial Domain payout.
 */
InternalPayoutSchema.index({ payoutId: 1 }, { unique: true });
/**
 * Parent provider payment lookup.
 */
InternalPayoutSchema.index({
    internalPaymentId: 1,
});
/**
 * Parent provider settlement lookup.
 */
InternalPayoutSchema.index({
    internalSettlementId: 1,
});
/**
 * Provider payment reconciliation.
 */
InternalPayoutSchema.index({
    providerPaymentId: 1,
});
/**
 * Provider settlement reconciliation.
 */
InternalPayoutSchema.index({
    providerSettlementId: 1,
});
/**
 * Provider payout lookup.
 */
InternalPayoutSchema.index({ providerPayoutId: 1 }, { unique: true });
/**
 * Duplicate request protection.
 */
InternalPayoutSchema.index({ idempotencyKey: 1 }, { unique: true });
/**
 * Active payout queries.
 */
InternalPayoutSchema.index({
    status: 1,
    isTerminal: 1,
});
/**
 * Reconciliation queries.
 */
InternalPayoutSchema.index({
    providerPaymentId: 1,
    providerSettlementId: 1,
    status: 1,
});
/**
 * Administrative timeline queries.
 */
InternalPayoutSchema.index({
    createdAt: -1,
});
/**
 * ==============================================================
 * Model
 * ==============================================================
 */
const InternalPayoutModel = mongoose_1.default.model("InternalPayout", InternalPayoutSchema);
exports.default = InternalPayoutModel;
