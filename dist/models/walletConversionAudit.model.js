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
exports.WalletConversionAudit = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const walletConversionAuditAction_enum_1 = require("../enums/financial/walletConversionAuditAction.enum");
const walletConversionDecision_enum_1 = require("../enums/financial/walletConversionDecision.enum");
const walletConversionRejectionCode_enum_1 = require("../enums/financial/walletConversionRejectionCode.enum");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const walletConversionProviderOutcome_enum_1 = require("../enums/financial/walletConversionProviderOutcome.enum");
const walletConversionOperationalClassification_enum_1 = require("../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalSeverity_enum_1 = require("../enums/financial/walletConversionOperationalSeverity.enum");
const schema = new mongoose_1.Schema({
    auditKey: { type: String, required: true, unique: true, immutable: true,
        select: false },
    action: { type: String, required: true, immutable: true,
        enum: Object.values(walletConversionAuditAction_enum_1.WalletConversionAuditAction) },
    conversionReference: { type: String, required: true, immutable: true,
        trim: true },
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
    fxEffectiveDate: { type: Date, required: true, immutable: true },
    requestedAt: { type: Date, required: true, immutable: true },
    decision: { type: String, immutable: true,
        enum: Object.values(walletConversionDecision_enum_1.WalletConversionDecision) },
    rejectionCode: { type: String, immutable: true,
        enum: Object.values(walletConversionRejectionCode_enum_1.WalletConversionRejectionCode) },
    adminActorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true,
        select: false },
    decidedAt: { type: Date, immutable: true },
    providerRequestReference: { type: String, immutable: true, trim: true },
    providerExecutionReference: { type: String, immutable: true, trim: true },
    providerStatus: { type: String, immutable: true,
        enum: Object.values(internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus) },
    providerOutcome: { type: String, immutable: true,
        enum: Object.values(walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome) },
    processingAt: { type: Date, immutable: true },
    completedAt: { type: Date, immutable: true },
    failureCode: { type: String, immutable: true, trim: true, maxlength: 64 },
    accountingReference: { type: String, immutable: true, trim: true },
    transactionReference: { type: String, immutable: true, trim: true },
    sourceProjectionReference: { type: String, immutable: true, trim: true },
    targetProjectionReference: { type: String, immutable: true, trim: true },
    sourceWalletVersion: { type: Number, immutable: true, min: 1,
        validate: Number.isSafeInteger },
    targetWalletVersion: { type: Number, immutable: true, min: 1,
        validate: Number.isSafeInteger },
    failedAt: { type: Date, immutable: true },
    reconciliationReference: { type: String, immutable: true, trim: true },
    classification: { type: String, immutable: true,
        enum: Object.values(walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification) },
    severity: { type: String, immutable: true,
        enum: Object.values(walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity) },
    issues: { type: [{ type: String, trim: true, maxlength: 96 }],
        immutable: true },
    retryPerformed: { type: Boolean, immutable: true },
    repairPerformed: { type: Boolean, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ conversionReference: 1, createdAt: -1 }, { name: "wallet_conversion_audit_reference" });
schema.index({ action: 1, decidedAt: -1 }, { name: "wallet_conversion_audit_decided" });
schema.index({ action: 1, completedAt: -1 }, { name: "wallet_conversion_audit_provider_completed" });
exports.WalletConversionAudit = mongoose_1.default.model("WalletConversionAudit", schema);
