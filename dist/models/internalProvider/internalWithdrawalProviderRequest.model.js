"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalWithdrawalProviderRequest = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../../constants/financial/financialLimits");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const schemas_1 = require("./schemas");
const schema = new mongoose_1.Schema({
    providerRequestReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    providerRequestKey: {
        type: String, required: true, immutable: true, trim: true, select: false,
    },
    withdrawalReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    creatorReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    walletReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    destinationReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    currency: {
        type: String, required: true, immutable: true, uppercase: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    amount: {
        type: Number, required: true, immutable: true, min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Provider withdrawal amount must be a positive safe integer.",
        },
    },
    providerStatus: {
        type: String, required: true,
        enum: Object.values(internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus),
        default: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.CREATED,
    },
    providerReference: {
        type: String, required: true, immutable: true, trim: true,
    },
    providerFingerprint: {
        type: String, required: true, immutable: true, select: false,
        match: /^[a-f0-9]{64}$/,
    },
    executionReference: {
        type: String, trim: true,
    },
    executionFingerprint: {
        type: String, trim: true, select: false, match: /^[a-f0-9]{64}$/,
    },
    providerMetadata: {
        type: schemas_1.ProviderMetadataSchema,
    },
    execution: {
        type: schemas_1.ProviderExecutionSchema,
    },
    payloads: {
        type: schemas_1.ProviderPayloadSchema,
    },
    terminalResult: {
        outcome: {
            type: String,
            enum: [
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
            ],
        },
        code: { type: String, trim: true, maxlength: 64 },
        message: { type: String, trim: true, maxlength: 500 },
    },
    isTerminal: {
        type: Boolean, required: true, default: false,
    },
    processingAt: Date,
    succeededAt: Date,
    failedAt: Date,
    version: {
        type: Number, required: true, default: 0, min: 0,
    },
}, { timestamps: true, versionKey: false });
schema.index({ providerRequestReference: 1 }, { unique: true });
schema.index({ providerRequestKey: 1 }, { unique: true });
schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index({ providerReference: 1 }, {
    unique: true,
    partialFilterExpression: { providerReference: { $type: "string" } },
});
exports.InternalWithdrawalProviderRequest = (0, mongoose_1.model)("InternalWithdrawalProviderRequest", schema);
