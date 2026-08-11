"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalReconciliation = void 0;
const mongoose_1 = require("mongoose");
const creatorWithdrawalOperationalAction_enum_1 = require("../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../enums/financial/creatorWithdrawalOperationalClassification.enum");
const creatorWithdrawalOperationalSeverity_enum_1 = require("../enums/financial/creatorWithdrawalOperationalSeverity.enum");
const creatorWithdrawalReconciliationStatus_enum_1 = require("../enums/financial/creatorWithdrawalReconciliationStatus.enum");
const schema = new mongoose_1.Schema({
    reconciliationReference: { type: String, required: true, immutable: true, trim: true },
    reconciliationKey: { type: String, required: true, immutable: true, trim: true, select: false },
    withdrawalRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
    withdrawalReference: { type: String, required: true, immutable: true, trim: true },
    providerRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "InternalWithdrawalProviderRequest", immutable: true, select: false },
    providerRequestReference: { type: String, trim: true },
    creatorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorProfile", required: true, immutable: true, select: false },
    creatorUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
    destinationReference: { type: String, required: true, immutable: true, trim: true },
    classification: { type: String, required: true, enum: Object.values(creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification) },
    status: { type: String, required: true, enum: Object.values(creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus) },
    severity: { type: String, required: true, enum: Object.values(creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity) },
    issueCodes: { type: [String], default: [] },
    recommendedAction: { type: String, enum: Object.values(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction) },
    allowedActions: { type: [String], enum: Object.values(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction), default: [] },
    snapshot: { type: mongoose_1.Schema.Types.Mixed, required: true, select: false },
    snapshotFingerprint: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
    retryCount: { type: Number, required: true, default: 0, min: 0 },
    maxRetryCount: { type: Number, required: true, min: 1 },
    nextRetryAt: Date,
    lastRetryAt: Date,
    lastRetryCode: { type: String, trim: true, maxlength: 100 },
    acknowledgedAt: Date,
    acknowledgedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    resolvedAt: Date,
    resolvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    resolutionCode: { type: String, trim: true, maxlength: 100 },
    resolutionNote: { type: String, trim: true, maxlength: 500 },
    detectedAt: { type: Date, required: true, immutable: true },
    lastInspectedAt: { type: Date, required: true },
    version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ withdrawalRequestId: 1 }, { unique: true });
schema.index({ withdrawalReference: 1 }, { unique: true });
schema.index({ providerRequestReference: 1 });
schema.index({ status: 1, classification: 1, createdAt: -1 });
schema.index({ status: 1, nextRetryAt: 1 });
schema.index({ severity: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
exports.CreatorWithdrawalReconciliation = (0, mongoose_1.model)("CreatorWithdrawalReconciliation", schema);
