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
exports.Withdrawal = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const withdrawalStatus_enum_1 = require("../enums/financial/withdrawalStatus.enum");
const payoutDestinationType_enum_1 = require("../enums/financial/payoutDestinationType.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../enums/financial/payoutDestinationVerificationStatus.enum");
const EncryptedWithdrawalDestinationSnapshotPayloadSchema = new mongoose_1.Schema({
    version: { type: Number, required: true, enum: [1], immutable: true },
    ciphertext: { type: String, required: true, immutable: true },
    iv: { type: String, required: true, immutable: true },
    authTag: { type: String, required: true, immutable: true },
}, { _id: false });
const WithdrawalDestinationSnapshotSchema = new mongoose_1.Schema({
    version: { type: Number, required: true, enum: [1], immutable: true },
    destinationReference: { type: String, required: true, immutable: true, trim: true },
    type: { type: String, enum: Object.values(payoutDestinationType_enum_1.PayoutDestinationType), required: true, immutable: true },
    maskedIdentifier: { type: String, required: true, immutable: true, trim: true },
    accountNumberLast4: { type: String, immutable: true },
    ifscDisplay: { type: String, immutable: true, uppercase: true },
    verificationStatus: { type: String, enum: [payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED], required: true, immutable: true },
    verifiedAt: { type: Date, required: true, immutable: true },
    snapshotCreatedAt: { type: Date, required: true, immutable: true },
    encryptedPayload: { type: EncryptedWithdrawalDestinationSnapshotPayloadSchema, required: true, immutable: true, select: false },
}, { _id: false });
const WithdrawalSchema = new mongoose_1.Schema({
    withdrawalReference: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
    },
    currency: {
        type: String,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
        required: true,
        uppercase: true,
        immutable: true,
    },
    status: {
        type: String,
        enum: Object.values(withdrawalStatus_enum_1.WithdrawalStatus),
        required: true,
        default: withdrawalStatus_enum_1.WithdrawalStatus.REQUESTED,
        index: true,
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
        lowercase: true,
    },
    requestedAt: {
        type: Date,
        required: true,
        default: Date.now,
        immutable: true,
    },
    reservedAt: Date,
    payoutId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payout",
        index: true,
    },
    payoutDestinationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "PayoutDestination",
        immutable: true,
        index: true,
    },
    destinationSnapshot: {
        type: WithdrawalDestinationSnapshotSchema,
        immutable: true,
    },
    processingAt: Date,
    completedAt: Date,
    failedAt: Date,
    failureReason: {
        type: String,
        trim: true,
    },
    isActiveObligation: { type: Boolean, required: true, default: true, index: true },
    cancelledAt: Date,
    cancelledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    attributes: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, { timestamps: true });
WithdrawalSchema.index({ creatorId: 1, status: 1 });
WithdrawalSchema.index({ creatorId: 1 }, { unique: true, partialFilterExpression: { isActiveObligation: true } });
WithdrawalSchema.index({ status: 1, createdAt: -1 });
WithdrawalSchema.index({ payoutId: 1 });
WithdrawalSchema.pre("validate", function () {
    const hasDestinationId = this.payoutDestinationId !== undefined && this.payoutDestinationId !== null;
    const snapshot = this.destinationSnapshot;
    if (hasDestinationId !== Boolean(snapshot)) {
        throw new Error("Withdrawal destination snapshot state is inconsistent.");
    }
    if (!snapshot)
        return;
    if (snapshot.version !== 1 || snapshot.verificationStatus !== payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED) {
        throw new Error("Withdrawal destination snapshot state is invalid.");
    }
    if (snapshot.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT) {
        if (!/^\d{4}$/.test(snapshot.accountNumberLast4 ?? "") || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(snapshot.ifscDisplay ?? "") || snapshot.maskedIdentifier !== `••••${snapshot.accountNumberLast4}`) {
            throw new Error("Withdrawal bank destination snapshot is invalid.");
        }
    }
    else if (snapshot.type === payoutDestinationType_enum_1.PayoutDestinationType.UPI) {
        if (snapshot.accountNumberLast4 !== undefined || snapshot.ifscDisplay !== undefined) {
            throw new Error("Withdrawal UPI destination snapshot is invalid.");
        }
    }
    else {
        throw new Error("Withdrawal destination snapshot type is invalid.");
    }
});
exports.Withdrawal = mongoose_1.default.model("Withdrawal", WithdrawalSchema);
