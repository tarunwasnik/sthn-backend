"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTopUpOperationalAudit = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpOperationalAction_enum_1 = require("../enums/financial/walletTopUpOperationalAction.enum");
const walletTopUpReconciliationClassification_enum_1 = require("../enums/financial/walletTopUpReconciliationClassification.enum");
const schema = new mongoose_1.Schema({
    auditReference: { type: String, required: true, immutable: true, unique: true },
    topUpReference: { type: String, required: true, immutable: true, index: true },
    reconciliationReference: { type: String, immutable: true, index: true },
    action: { type: String, required: true, immutable: true, enum: Object.values(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction), index: true },
    actorType: { type: String, required: true, immutable: true, enum: ["ADMIN", "SYSTEM"] },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true, select: false },
    result: { type: String, required: true, immutable: true, enum: ["SUCCEEDED", "FAILED", "REJECTED"] },
    classificationBefore: { type: String, enum: Object.values(walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification) },
    classificationAfter: { type: String, enum: Object.values(walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification) },
    reasonCode: { type: String, required: true, trim: true },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
    createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false });
schema.index({ reconciliationReference: 1, createdAt: -1 });
schema.index({ topUpReference: 1, createdAt: -1 });
exports.WalletTopUpOperationalAudit = (0, mongoose_1.model)("WalletTopUpOperationalAudit", schema);
