"use strict";
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
exports.PayoutDestination = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const payoutDestinationType_enum_1 = require("../enums/financial/payoutDestinationType.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../enums/financial/payoutDestinationVerificationStatus.enum");
const EncryptedPayloadSchema = new mongoose_1.Schema({
    version: { type: Number, required: true, enum: [1] },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
}, { _id: false });
const PayoutDestinationSchema = new mongoose_1.Schema({
    destinationReference: {
        type: String, required: true, unique: true, immutable: true, index: true, trim: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true,
    },
    type: {
        type: String, enum: Object.values(payoutDestinationType_enum_1.PayoutDestinationType), required: true, immutable: true, index: true,
    },
    verificationStatus: {
        type: String,
        enum: Object.values(payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus),
        required: true,
        default: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.UNVERIFIED,
        index: true,
    },
    isActive: { type: Boolean, required: true, default: true, index: true },
    idempotencyKey: {
        type: String, required: true, immutable: true, trim: true, lowercase: true, select: false,
    },
    destinationFingerprint: {
        type: String, required: true, immutable: true, select: false,
    },
    requestFingerprint: {
        type: String, required: true, immutable: true, select: false,
    },
    encryptedPayload: { type: EncryptedPayloadSchema, required: true, immutable: true, select: false },
    maskedIdentifier: { type: String, required: true, immutable: true, trim: true },
    accountNumberLast4: {
        type: String,
        immutable: true,
    },
    ifscDisplay: {
        type: String,
        immutable: true,
        uppercase: true,
    },
    deactivatedAt: Date,
    reactivatedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        select: false,
    },
    rejectedAt: Date,
    rejectedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        select: false,
    },
    rejectionCode: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 64,
        select: false,
    },
    rejectionReason: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    verificationNote: {
        type: String,
        trim: true,
        maxlength: 500,
        select: false,
    },
    withdrawalBindingRevision: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        select: false,
    },
}, { timestamps: true });
PayoutDestinationSchema.pre("validate", function () {
    if (this.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT) {
        if (!/^\d{4}$/.test(this.accountNumberLast4 ?? "")) {
            throw new Error("Bank destinations require accountNumberLast4.");
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(this.ifscDisplay ?? "")) {
            throw new Error("Bank destinations require a valid IFSC display value.");
        }
    }
    else if (this.accountNumberLast4 !== undefined || this.ifscDisplay !== undefined) {
        throw new Error("UPI destinations cannot include bank display fields.");
    }
});
PayoutDestinationSchema.index({ creatorId: 1, idempotencyKey: 1 }, { unique: true });
PayoutDestinationSchema.index({ creatorId: 1, type: 1, destinationFingerprint: 1 }, { unique: true });
PayoutDestinationSchema.index({ creatorId: 1, isActive: 1, createdAt: -1 });
exports.PayoutDestination = mongoose_1.default.model("PayoutDestination", PayoutDestinationSchema);
