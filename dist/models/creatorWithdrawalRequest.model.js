"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalRequest = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const creatorWithdrawalRequestStatus_enum_1 = require("../enums/financial/creatorWithdrawalRequestStatus.enum");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const creatorWithdrawalFinalizationOutcome_enum_1 = require("../enums/financial/creatorWithdrawalFinalizationOutcome.enum");
const positiveMinorUnit = {
    type: Number,
    required: true,
    immutable: true,
    min: 1,
    max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: "Withdrawal amount must be a positive safe integer.",
    },
};
const schema = new mongoose_1.Schema({
    withdrawalReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    withdrawalKey: {
        type: String, required: true, immutable: true, trim: true, select: false,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorProfile", required: true,
        immutable: true,
    },
    creatorUserId: {
        type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true,
    },
    walletId: {
        type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true,
    },
    destinationId: {
        type: mongoose_1.Schema.Types.ObjectId, ref: "PayoutDestination", required: true,
        immutable: true,
    },
    destinationReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    currency: {
        type: String, required: true, immutable: true, uppercase: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    amount: positiveMinorUnit,
    reservedAmount: {
        type: Number, required: true, default: 0, min: 0,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Reserved amount must be a non-negative safe integer.",
        },
    },
    status: {
        type: String, required: true,
        enum: Object.values(creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus),
        default: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.PENDING,
    },
    requestFingerprint: {
        type: String, required: true, immutable: true, select: false,
    },
    ledgerTransactionReference: {
        type: String, trim: true, select: false,
    },
    ledgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [], select: false,
    },
    projectionReference: {
        type: String, trim: true,
    },
    providerRequestReference: {
        type: String, trim: true,
    },
    providerTerminalStatus: {
        type: String,
        enum: [
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
        ],
    },
    providerProcessingAt: Date,
    providerSucceededAt: Date,
    providerFailedAt: Date,
    providerExecutionMetadata: {
        provider: { type: String, trim: true },
        providerRequestReference: { type: String, trim: true },
        providerReference: { type: String, trim: true },
        executionReference: { type: String, trim: true },
        responseCode: { type: String, trim: true, maxlength: 64 },
        failureCode: { type: String, trim: true, maxlength: 64 },
    },
    finalizationOutcome: {
        type: String,
        enum: Object.values(creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome),
        select: false,
    },
    finalizationReference: {
        type: String, trim: true,
    },
    finalizationKey: {
        type: String, trim: true, select: false,
    },
    finalizationTransactionId: {
        type: String, trim: true, select: false,
    },
    finalizationLedgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [], select: false,
    },
    finalizationProjectionOperationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "WalletProjectionOperation",
        select: false,
    },
    finalizationProjectionOperationReference: {
        type: String, trim: true, select: false,
    },
    finalizationFingerprint: {
        type: String, trim: true, select: false, match: /^[a-f0-9]{64}$/,
    },
    providerTerminalReference: {
        type: String, trim: true, select: false,
    },
    providerFailureCode: {
        type: String, trim: true, maxlength: 64, select: false,
    },
    completedAt: Date,
    failedAt: Date,
    requestedAt: {
        type: Date, required: true, immutable: true, default: Date.now,
    },
    reservedAt: Date,
    isActiveObligation: {
        type: Boolean, required: true, default: true, select: false,
    },
    version: {
        type: Number, required: true, default: 0, min: 0,
    },
}, { timestamps: true, versionKey: false });
schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index({ withdrawalKey: 1 }, { unique: true });
schema.index({ creatorId: 1, requestedAt: -1 });
schema.index({ creatorUserId: 1, requestedAt: -1 });
schema.index({ walletId: 1, requestedAt: -1 });
schema.index({ status: 1, requestedAt: -1 });
schema.index({ requestedAt: -1 });
schema.index({ finalizationReference: 1 }, {
    unique: true,
    partialFilterExpression: { finalizationReference: { $type: "string" } },
});
schema.index({ finalizationKey: 1 }, {
    unique: true,
    partialFilterExpression: { finalizationKey: { $type: "string" } },
});
schema.index({ finalizationTransactionId: 1 }, {
    unique: true,
    partialFilterExpression: {
        finalizationTransactionId: { $type: "string" },
    },
});
schema.index({ finalizationProjectionOperationReference: 1 }, {
    unique: true,
    partialFilterExpression: {
        finalizationProjectionOperationReference: { $type: "string" },
    },
});
schema.index({ status: 1, completedAt: -1 });
schema.index({ status: 1, failedAt: -1 });
schema.index({ walletId: 1, status: 1 });
schema.index({ creatorId: 1, status: 1 });
schema.index({ providerRequestReference: 1 });
schema.index({ creatorUserId: 1 }, {
    unique: true,
    partialFilterExpression: { isActiveObligation: true },
    name: "creator_withdrawal_one_active",
});
exports.CreatorWithdrawalRequest = (0, mongoose_1.model)("CreatorWithdrawalRequest", schema);
