"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementRepairOperation = void 0;
const mongoose_1 = require("mongoose");
const bookingCreatorSettlementReconciliation_enum_1 = require("../enums/financial/bookingCreatorSettlementReconciliation.enum");
const schema = new mongoose_1.Schema({
    operationReference: { type: String, required: true, immutable: true, unique: true },
    operationKey: { type: String, required: true, immutable: true, unique: true, select: false },
    reconciliationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingCreatorSettlementReconciliation", required: true, immutable: true },
    reconciliationReference: { type: String, required: true, immutable: true, index: true },
    settlementId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true },
    settlementReference: { type: String, required: true, immutable: true, index: true },
    action: { type: String, required: true, immutable: true, enum: Object.values(bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction) },
    snapshotFingerprint: { type: String, required: true, immutable: true, select: false },
    repairedFields: { type: [String], default: [] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
    status: { type: String, required: true, enum: ["STARTED", "APPLIED", "REJECTED"] },
    reason: { type: String, required: true, immutable: true, trim: true, maxlength: 240 },
    resultCode: { type: String, trim: true },
    appliedAt: Date,
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationId: 1, action: 1 }, { unique: true });
exports.BookingCreatorSettlementRepairOperation = (0, mongoose_1.model)("BookingCreatorSettlementRepairOperation", schema);
