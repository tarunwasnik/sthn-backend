"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlementReconciliation = void 0;
const mongoose_1 = require("mongoose");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const bookingCreatorSettlementReconciliation_enum_1 = require("../enums/financial/bookingCreatorSettlementReconciliation.enum");
const schema = new mongoose_1.Schema({
    reconciliationReference: { type: String, required: true, immutable: true, trim: true },
    reconciliationKey: { type: String, required: true, immutable: true, trim: true, select: false },
    settlementId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingCreatorSettlement", required: true, immutable: true, select: false },
    settlementReference: { type: String, required: true, immutable: true, trim: true },
    bookingReference: { type: String, required: true, immutable: true, trim: true },
    allocationReference: { type: String, required: true, immutable: true, trim: true },
    walletReference: { type: String, required: true, immutable: true, trim: true },
    creatorReference: { type: String, required: true, immutable: true, trim: true },
    status: { type: String, required: true, enum: Object.values(bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationStatus), index: true },
    result: { type: String, required: true, enum: Object.values(bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationResult) },
    classification: { type: String, required: true, enum: Object.values(bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification), index: true },
    issuesFound: { type: [String], default: [] },
    checkedAt: { type: Date, required: true, index: true },
    snapshot: { type: mongoose_1.Schema.Types.Mixed, required: true, select: false },
    snapshotFingerprint: { type: String, required: true, select: false },
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ settlementId: 1 }, { unique: true });
schema.index({ settlementReference: 1 }, { unique: true });
schema.index({ status: 1, checkedAt: -1 });
exports.BookingCreatorSettlementReconciliation = (0, mongoose_1.model)("BookingCreatorSettlementReconciliation", schema);
