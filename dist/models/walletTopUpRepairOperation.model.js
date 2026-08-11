"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpRepairOperation = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpOperationalAction_enum_1 = require("../enums/financial/walletTopUpOperationalAction.enum");
const schema = new mongoose_1.Schema({
    operationReference: { type: String, required: true, immutable: true, unique: true },
    operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
    reconciliationReference: { type: String, required: true, immutable: true, index: true },
    topUpReference: { type: String, required: true, immutable: true, index: true },
    action: { type: String, required: true, immutable: true, enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction) },
    snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
    repairedFields: { type: [String], default: [] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
    status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
    resultCode: { type: String, trim: true },
    appliedAt: Date,
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ topUpReference: 1, createdAt: -1 });
exports.WalletTopUpRepairOperation = (0, mongoose_1.model)("WalletTopUpRepairOperation", schema);
