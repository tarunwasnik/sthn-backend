"use strict";
// backend/src/models/settlement.model.ts
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
exports.Settlement = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const paymentProvider_enum_1 = require("../enums/financial/paymentProvider.enum");
const settlementStatus_enum_1 = require("../enums/financial/settlementStatus.enum");
const financialReconciliationStatus_enum_1 = require("../enums/financial/financialReconciliationStatus.enum");
const financialReconciliationReason_enum_1 = require("../enums/financial/financialReconciliationReason.enum");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const SettlementSchema = new mongoose_1.Schema({
    settlementReference: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
    },
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        index: true,
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
        index: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    currency: {
        type: String,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
        required: true,
        uppercase: true,
        immutable: true,
    },
    status: {
        type: String,
        enum: Object.values(settlementStatus_enum_1.SettlementStatus),
        default: settlementStatus_enum_1.SettlementStatus.CREATED,
        required: true,
        index: true,
    },
    provider: {
        type: String,
        enum: Object.values(paymentProvider_enum_1.PaymentProvider),
        default: paymentProvider_enum_1.PaymentProvider.INTERNAL,
        required: true,
        index: true,
    },
    providerSettlementId: String,
    providerBatchId: String,
    providerTransactionId: String,
    attemptNumber: {
        type: Number,
        default: 1,
        min: 1,
    },
    retryable: {
        type: Boolean,
        default: true,
    },
    failureMessage: String,
    idempotencyKey: {
        type: String,
        required: true,
        immutable: true,
        index: true,
    },
    settledAt: Date,
    providerPayload: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    attributes: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    financialObligationKey: { type: String, immutable: true, trim: true, index: true },
    reconciliationStatus: { type: String, enum: Object.values(financialReconciliationStatus_enum_1.FinancialReconciliationStatus), index: true },
    reconciliationReason: { type: String, enum: Object.values(financialReconciliationReason_enum_1.FinancialReconciliationReason) },
    reconciliationNote: { type: String, trim: true, maxlength: 500 },
    serviceAmount: { type: Number, immutable: true, min: 0 }, customerFeeAmount: { type: Number, immutable: true, min: 0 }, grossEscrowAmount: { type: Number, immutable: true, min: 0 },
    platformCommissionRateBps: { type: Number, immutable: true, min: 0, max: 10000 }, platformCommissionAmount: { type: Number, immutable: true, min: 0 }, creatorNetAmount: { type: Number, immutable: true, min: 0 }, platformRevenueAmount: { type: Number, immutable: true, min: 0 }, calculationVersion: { type: Number, immutable: true, min: 1 }, ledgerTransactionReference: { type: String, immutable: true, trim: true },
}, {
    timestamps: true,
});
/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */
SettlementSchema.index({ paymentId: 1, status: 1 });
SettlementSchema.index({ bookingId: 1, status: 1 });
SettlementSchema.index({ creatorId: 1, status: 1 });
SettlementSchema.index({ userId: 1, status: 1 });
SettlementSchema.index({ status: 1, createdAt: -1 });
SettlementSchema.index({ provider: 1, status: 1 });
SettlementSchema.index({ providerSettlementId: 1 });
SettlementSchema.index({ providerBatchId: 1 });
SettlementSchema.index({ settledAt: -1 });
// Legacy records may be incomplete; a partial index protects only established obligations.
SettlementSchema.index({ financialObligationKey: 1 }, { unique: true, partialFilterExpression: { financialObligationKey: { $type: "string" } } });
exports.Settlement = mongoose_1.default.model("Settlement", SettlementSchema);
