"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpRetryAttempt = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpOperationalAction_enum_1 = require("../enums/financial/walletTopUpOperationalAction.enum");
const schema = new mongoose_1.Schema({
    operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
    reconciliationReference: { type: String, required: true, immutable: true, index: true },
    topUpReference: { type: String, required: true, immutable: true, index: true },
    attemptNumber: { type: Number, required: true, immutable: true, min: 1 },
    action: { type: String, required: true, immutable: true, enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction) },
    actorType: { type: String, required: true, immutable: true, enum: ["ADMIN", "SYSTEM"] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
    startedAt: { type: Date, required: true, immutable: true },
    completedAt: Date,
    resultCode: { type: String, trim: true },
    safeErrorCode: { type: String, trim: true },
    nextRetryAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ reconciliationReference: 1, attemptNumber: 1 }, { unique: true });
exports.WalletTopUpRetryAttempt = (0, mongoose_1.model)("WalletTopUpRetryAttempt", schema);
