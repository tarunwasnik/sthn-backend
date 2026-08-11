"use strict";
// backend/src/models/ledgerEntry.model.ts
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
exports.LedgerEntry = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ledgerEntryType_enum_1 = require("../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../enums/financial/moneyDirection.enum");
const ledgerAccount_enum_1 = require("../enums/financial/ledgerAccount.enum");
const LedgerEntrySchema = new mongoose_1.Schema({
    ledgerReference: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
    },
    transactionId: {
        type: String,
        required: true,
        immutable: true,
        index: true,
        trim: true,
    },
    idempotencyKey: {
        type: String,
        immutable: true,
        sparse: true,
        index: true,
        trim: true,
    },
    type: {
        type: String,
        enum: Object.values(ledgerEntryType_enum_1.LedgerEntryType),
        required: true,
        index: true,
    },
    source: {
        type: String,
        enum: Object.values(ledgerSource_enum_1.LedgerSource),
        required: true,
        index: true,
    },
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
        index: true,
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        index: true,
    },
    refundId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Refund",
        index: true,
    },
    payoutId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payout",
        index: true,
    },
    settlementId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Settlement",
        index: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        index: true,
    },
    walletId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Wallet",
        index: true,
        immutable: true,
    },
    direction: {
        type: String,
        enum: Object.values(moneyDirection_enum_1.MoneyDirection),
        required: true,
        index: true,
    },
    account: { type: String, enum: Object.values(ledgerAccount_enum_1.LedgerAccount), immutable: true, index: true },
    postingKey: { type: String, immutable: true, trim: true, select: false },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        required: true,
        uppercase: true,
        immutable: true,
    },
    description: {
        type: String,
        trim: true,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});
/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */
LedgerEntrySchema.index({ bookingId: 1, createdAt: -1 });
LedgerEntrySchema.index({ paymentId: 1 });
LedgerEntrySchema.index({ refundId: 1 });
LedgerEntrySchema.index({ payoutId: 1 });
LedgerEntrySchema.index({ settlementId: 1 });
LedgerEntrySchema.index({ userId: 1, createdAt: -1 });
LedgerEntrySchema.index({ type: 1, createdAt: -1 });
LedgerEntrySchema.index({ source: 1, createdAt: -1 });
LedgerEntrySchema.index({ transactionId: 1 });
LedgerEntrySchema.index({ idempotencyKey: 1 }, {
    sparse: true,
});
LedgerEntrySchema.index({ postingKey: 1 }, { unique: true, partialFilterExpression: { postingKey: { $type: "string" } } });
exports.LedgerEntry = mongoose_1.default.model("LedgerEntry", LedgerEntrySchema);
