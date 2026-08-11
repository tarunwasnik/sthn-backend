"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalRetryAttempt = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    attemptReference: { type: String, required: true, immutable: true, trim: true },
    attemptKey: { type: String, required: true, immutable: true, trim: true, select: false },
    reconciliationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorWithdrawalReconciliation", required: true, immutable: true },
    reconciliationReference: { type: String, required: true, immutable: true, trim: true },
    withdrawalRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
    withdrawalReference: { type: String, required: true, immutable: true, trim: true },
    attemptNumber: { type: Number, required: true, immutable: true, min: 1 },
    action: { type: String, required: true, immutable: true, enum: ["RETRY_FINALIZATION"] },
    snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
    status: { type: String, required: true, enum: ["STARTED", "APPLIED", "FAILED"] },
    safeErrorCode: { type: String, trim: true, maxlength: 100 },
    actorType: { type: String, required: true, immutable: true, enum: ["SYSTEM", "ADMIN"] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
    startedAt: { type: Date, required: true, immutable: true },
    completedAt: Date,
    nextRetryAt: Date,
}, { timestamps: true, versionKey: false });
schema.index({ attemptReference: 1 }, { unique: true });
schema.index({ attemptKey: 1 }, { unique: true });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ withdrawalReference: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
exports.CreatorWithdrawalRetryAttempt = (0, mongoose_1.model)("CreatorWithdrawalRetryAttempt", schema);
