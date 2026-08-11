"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalWalletConversionProviderRequest = void 0;
const mongoose_1 = require("mongoose");
const financialLimits_1 = require("../../constants/financial/financialLimits");
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const walletConversionProviderOutcome_enum_1 = require("../../enums/financial/walletConversionProviderOutcome.enum");
const schemas_1 = require("./schemas");
const schema = new mongoose_1.Schema({
    providerRequestReference: { type: String, required: true, immutable: true,
        trim: true },
    providerRequestKey: { type: String, required: true, immutable: true,
        trim: true, select: false },
    conversionReference: { type: String, required: true, immutable: true,
        trim: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true,
        immutable: true, select: false },
    sourceWalletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true,
        immutable: true, select: false },
    targetWalletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet",
        immutable: true, select: false },
    sourceCurrency: { type: String, required: true, immutable: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    targetCurrency: { type: String, required: true, immutable: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    sourceAmount: { type: Number, required: true, immutable: true, min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: Number.isSafeInteger },
    targetAmount: { type: Number, required: true, immutable: true, min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: Number.isSafeInteger },
    fxSnapshotReference: { type: String, required: true, immutable: true,
        trim: true },
    fxProvider: { type: String, required: true, immutable: true, trim: true,
        maxlength: 64 },
    fxEffectiveDate: { type: Date, required: true, immutable: true },
    provider: { type: String, required: true, immutable: true, trim: true,
        maxlength: 64 },
    providerExecutionReference: { type: String, required: true, immutable: true,
        trim: true },
    providerFingerprint: { type: String, required: true, immutable: true,
        select: false, match: /^[a-f0-9]{64}$/ },
    executionFingerprint: { type: String, required: true, immutable: true,
        select: false, match: /^[a-f0-9]{64}$/ },
    providerStatus: { type: String, required: true,
        enum: Object.values(internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus),
        default: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.INITIALIZED },
    providerOutcome: { type: String,
        enum: Object.values(walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome) },
    providerMetadata: { type: schemas_1.ProviderMetadataSchema, select: false },
    execution: { type: schemas_1.ProviderExecutionSchema, select: false },
    payloads: { type: schemas_1.ProviderPayloadSchema, select: false },
    responseCode: { type: String, trim: true, maxlength: 64 },
    failureCode: { type: String, trim: true, maxlength: 64 },
    failureReason: { type: String, trim: true, maxlength: 500, select: false },
    processingAt: Date,
    completedAt: Date,
    isTerminal: { type: Boolean, required: true, default: false },
    version: { type: Number, required: true, default: 0, min: 0,
        validate: Number.isSafeInteger },
}, { timestamps: true, versionKey: false });
schema.index({ providerRequestReference: 1 }, { unique: true,
    name: "wallet_conversion_provider_reference" });
schema.index({ providerRequestKey: 1 }, { unique: true,
    name: "wallet_conversion_provider_key" });
schema.index({ conversionReference: 1 }, { unique: true,
    name: "wallet_conversion_provider_conversion" });
schema.index({ providerExecutionReference: 1 }, { unique: true,
    name: "wallet_conversion_provider_execution" });
schema.index({ providerStatus: 1, createdAt: 1 }, { name: "wallet_conversion_provider_status_created" });
exports.InternalWalletConversionProviderRequest = (0, mongoose_1.model)("InternalWalletConversionProviderRequest", schema);
