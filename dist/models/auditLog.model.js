"use strict";
//backend/src/models/auditLog.model.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const AuditLogSchema = new mongoose_1.Schema({
    actorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        index: true,
    },
    actorType: {
        type: String,
        enum: ["USER", "ADMIN", "CREATOR", "SYSTEM", "PROVIDER"],
        required: true,
        index: true,
    },
    actorReference: { type: String, trim: true, maxlength: 160 },
    category: { type: String, enum: ["AUTH", "PROFILE", "GOVERNANCE", "BOOKING", "FINANCIAL", "ADMIN", "SYSTEM"], index: true },
    action: {
        type: String,
        required: true,
        index: true,
    },
    entityType: {
        type: String,
        required: true,
        index: true,
    },
    entityId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    before: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    after: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    financialContext: {
        domain: { type: String, enum: ["PAYMENT", "REFUND", "ESCROW", "SETTLEMENT", "WITHDRAWAL", "PAYOUT", "BOOKING_WALLET"], index: true },
        primaryReference: { type: String, trim: true, maxlength: 160, index: true },
        paymentReference: { type: String, trim: true, maxlength: 160, index: true },
        bookingReference: { type: String, trim: true, maxlength: 160, index: true },
        refundReference: { type: String, trim: true, maxlength: 160, index: true },
        settlementReference: { type: String, trim: true, maxlength: 160, index: true },
        withdrawalReference: { type: String, trim: true, maxlength: 160, index: true },
        payoutReference: { type: String, trim: true, maxlength: 160, index: true },
        provider: { type: String, trim: true, maxlength: 64 },
        providerReference: { type: String, trim: true, maxlength: 160 },
        amount: { type: Number, min: 0 },
        currency: { type: String, trim: true, uppercase: true, maxlength: 8 },
        ledgerTransactionReference: { type: String, trim: true, maxlength: 160 },
        projectionOperationReference: { type: String, trim: true, maxlength: 160 },
    },
    transition: {
        fromStatus: { type: String, trim: true, maxlength: 64 }, toStatus: { type: String, trim: true, maxlength: 64 },
        outcome: { type: String, enum: ["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "BLOCKED", "REPLAYED", "CONFLICT"] },
    },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, {
    timestamps: { createdAt: true, updatedAt: false },
});
AuditLogSchema.index({ category: 1, createdAt: -1 }, { name: "audit_category_created_at" });
AuditLogSchema.index({ action: 1, createdAt: -1 }, { name: "audit_action_created_at" });
AuditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 }, { name: "audit_actor_created_at" });
AuditLogSchema.index({ "financialContext.domain": 1, createdAt: -1 }, { name: "audit_financial_domain_created_at" });
exports.AuditLog = mongoose_1.default.model("AuditLog", AuditLogSchema);
