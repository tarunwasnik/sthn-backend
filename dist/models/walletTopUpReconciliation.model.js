"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpReconciliation = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpReconciliationClassification_enum_1 = require("../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpReconciliationStatus_enum_1 = require("../enums/financial/walletTopUpReconciliationStatus.enum");
const walletTopUpReconciliationSeverity_enum_1 = require("../enums/financial/walletTopUpReconciliationSeverity.enum");
const walletTopUpOperationalAction_enum_1 = require("../enums/financial/walletTopUpOperationalAction.enum");
const schema = new mongoose_1.Schema({
    reconciliationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
    reconciliationKey: { type: String, required: true, immutable: true, unique: true, select: false },
    topUpRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "WalletTopUpRequest", required: true, immutable: true, unique: true },
    topUpReference: { type: String, required: true, immutable: true, index: true, trim: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
    providerFundingId: { type: mongoose_1.Schema.Types.ObjectId, ref: "InternalTopUpFunding", select: false },
    providerFundingReference: { type: String, trim: true, index: true },
    classification: { type: String, required: true, enum: Object.values(walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification), index: true },
    status: { type: String, required: true, enum: Object.values(walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus), index: true },
    severity: { type: String, required: true, enum: Object.values(walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity), index: true },
    detectedIssues: { type: [String], default: [] },
    detectedAt: { type: Date, required: true, immutable: true },
    lastInspectedAt: { type: Date, required: true },
    recommendedAction: { type: String, enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction) },
    allowedActions: { type: [String], enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction), default: [] },
    retryCount: { type: Number, required: true, default: 0, min: 0 },
    maxRetryCount: { type: Number, required: true, min: 1 },
    nextRetryAt: Date,
    lastRetryAt: Date,
    lastRetryCode: { type: String, trim: true },
    resolutionAction: { type: String, enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction) },
    resolutionCode: { type: String, trim: true },
    resolutionNote: { type: String, trim: true, maxlength: 500 },
    resolvedAt: Date,
    resolvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    snapshot: { type: mongoose_1.Schema.Types.Mixed, required: true, select: false },
    fingerprint: { type: String, required: true, select: false },
    version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });
schema.index({ status: 1, classification: 1, createdAt: -1 });
schema.index({ status: 1, nextRetryAt: 1 });
schema.index({ createdAt: -1 });
exports.WalletTopUpReconciliation = (0, mongoose_1.model)("WalletTopUpReconciliation", schema);
