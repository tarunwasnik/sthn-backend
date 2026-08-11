"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementRetryAttempt = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    operationReference: { type: String, required: true, immutable: true, unique: true },
    operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
    reconciliationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingCreatorSettlementReconciliation", required: true, immutable: true },
    reconciliationReference: { type: String, required: true, immutable: true, index: true },
    settlementId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true },
    settlementReference: { type: String, required: true, immutable: true, index: true },
    actorType: { type: String, required: true, immutable: true, enum: ["SYSTEM", "ADMIN"] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
    status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
    reason: { type: String, required: true, immutable: true, trim: true, maxlength: 240 },
    resultCode: { type: String, trim: true },
    startedAt: { type: Date, required: true, immutable: true },
    completedAt: Date,
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationId: 1, createdAt: -1 });
exports.BookingCreatorSettlementRetryAttempt = (0, mongoose_1.model)("BookingCreatorSettlementRetryAttempt", schema);
