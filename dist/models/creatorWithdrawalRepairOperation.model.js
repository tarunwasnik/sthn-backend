"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorWithdrawalRepairOperation = void 0;
const mongoose_1 = require("mongoose");
const creatorWithdrawalOperationalAction_enum_1 = require("../enums/financial/creatorWithdrawalOperationalAction.enum");
const schema = new mongoose_1.Schema({
    repairReference: { type: String, required: true, immutable: true, trim: true },
    repairKey: { type: String, required: true, immutable: true, trim: true, select: false },
    reconciliationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorWithdrawalReconciliation", required: true, immutable: true },
    reconciliationReference: { type: String, required: true, immutable: true, trim: true },
    withdrawalRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorWithdrawalRequest", required: true, immutable: true, select: false },
    withdrawalReference: { type: String, required: true, immutable: true, trim: true },
    action: { type: String, required: true, immutable: true, enum: [
            creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS,
            creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT,
        ] },
    snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
    repairedFields: { type: [String], default: [] },
    status: { type: String, required: true, enum: ["STARTED", "APPLIED", "FAILED"] },
    resultCode: { type: String, trim: true, maxlength: 100 },
    performedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
    performedAt: Date,
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });
schema.index({ repairReference: 1 }, { unique: true });
schema.index({ repairKey: 1 }, { unique: true });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ withdrawalReference: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
exports.CreatorWithdrawalRepairOperation = (0, mongoose_1.model)("CreatorWithdrawalRepairOperation", schema);
