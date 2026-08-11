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
exports.WalletConversionRequest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const financialLimits_1 = require("../constants/financial/financialLimits");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const fxRate_constants_1 = require("../constants/financial/fxRate.constants");
const walletConversionRequestStatus_enum_1 = require("../enums/financial/walletConversionRequestStatus.enum");
const walletConversionRejectionCode_enum_1 = require("../enums/financial/walletConversionRejectionCode.enum");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const walletConversionProviderOutcome_enum_1 = require("../enums/financial/walletConversionProviderOutcome.enum");
const schema = new mongoose_1.Schema({
    conversionReference: { type: String, required: true, unique: true,
        immutable: true, trim: true },
    conversionKey: { type: String, required: true, unique: true,
        immutable: true, select: false },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true,
        immutable: true, select: false },
    sourceWalletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true,
        immutable: true, select: false },
    targetWalletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", immutable: true,
        select: false },
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
    fxSnapshotId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ExchangeRateSnapshot",
        required: true, immutable: true, select: false },
    fxSnapshotReference: { type: String, required: true, immutable: true,
        trim: true },
    fxProvider: { type: String, required: true, immutable: true, trim: true,
        maxlength: 64 },
    fxEffectiveDate: { type: Date, required: true, immutable: true },
    rateValue: { type: String, required: true, immutable: true, select: false,
        validate: /^\d+$/ },
    rateScale: { type: Number, required: true, immutable: true, select: false,
        min: 0, max: fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
    inverseRateValue: { type: String, required: true, immutable: true,
        select: false, validate: /^\d+$/ },
    inverseRateScale: { type: Number, required: true, immutable: true,
        select: false, min: 0, max: fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE,
        validate: Number.isSafeInteger },
    sourceMinorUnits: { type: Number, required: true, immutable: true,
        select: false, min: 0, max: 6, validate: Number.isSafeInteger },
    targetMinorUnits: { type: Number, required: true, immutable: true,
        select: false, min: 0, max: 6, validate: Number.isSafeInteger },
    idempotencyKey: { type: String, required: true, immutable: true,
        trim: true, lowercase: true, select: false },
    requestFingerprint: { type: String, required: true, immutable: true,
        select: false },
    status: { type: String, required: true,
        enum: Object.values(walletConversionRequestStatus_enum_1.WalletConversionRequestStatus),
        default: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING },
    requestedAt: { type: Date, required: true, immutable: true },
    decidedAt: { type: Date },
    decidedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    rejectionCode: { type: String,
        enum: Object.values(walletConversionRejectionCode_enum_1.WalletConversionRejectionCode) },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    providerRequestReference: { type: String, trim: true },
    providerExecutionReference: { type: String, trim: true },
    providerStatus: { type: String,
        enum: Object.values(internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus) },
    providerOutcome: { type: String,
        enum: Object.values(walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome) },
    providerProcessingAt: Date,
    providerCompletedAt: Date,
    providerFailureCode: { type: String, trim: true, maxlength: 64 },
    providerMetadata: { type: new mongoose_1.Schema({
            provider: { type: String, required: true, trim: true, maxlength: 64 },
            responseCode: { type: String, required: true, trim: true, maxlength: 64 },
        }, { _id: false }), select: false },
    accountingReference: { type: String, trim: true },
    accountingKey: { type: String, trim: true, select: false },
    accountingFingerprint: { type: String, select: false,
        match: /^[a-f0-9]{64}$/ },
    accountingTransactionReference: { type: String, trim: true, select: false },
    accountingTargetWalletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet",
        select: false },
    sourceProjectionReference: { type: String, trim: true, select: false },
    targetProjectionReference: { type: String, trim: true, select: false },
    sourceWalletVersion: { type: Number, min: 1, select: false,
        validate: Number.isSafeInteger },
    targetWalletVersion: { type: Number, min: 1, select: false,
        validate: Number.isSafeInteger },
    completedAt: Date,
    failedAt: Date,
}, { timestamps: true, versionKey: false });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, name: "wallet_conversion_user_idempotency" });
schema.index({ userId: 1, requestedAt: -1 }, { name: "wallet_conversion_user_requested" });
schema.index({ status: 1, requestedAt: 1 }, { name: "wallet_conversion_status_requested" });
schema.index({ status: 1, decidedAt: -1 }, { name: "wallet_conversion_status_decided" });
schema.index({ sourceWalletId: 1, status: 1 }, { name: "wallet_conversion_source_status" });
schema.index({ sourceCurrency: 1, targetCurrency: 1, requestedAt: -1 }, { name: "wallet_conversion_pair_requested" });
schema.index({ fxSnapshotReference: 1 }, { name: "wallet_conversion_snapshot_reference" });
schema.index({ providerRequestReference: 1 }, { unique: true,
    partialFilterExpression: { providerRequestReference: { $type: "string" } },
    name: "wallet_conversion_provider_request" });
schema.index({ accountingReference: 1 }, { unique: true,
    partialFilterExpression: { accountingReference: { $type: "string" } },
    name: "wallet_conversion_accounting_reference" });
schema.index({ accountingTransactionReference: 1 }, { unique: true,
    partialFilterExpression: {
        accountingTransactionReference: { $type: "string" },
    }, name: "wallet_conversion_accounting_transaction" });
exports.WalletConversionRequest = mongoose_1.default.model("WalletConversionRequest", schema);
