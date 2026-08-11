"use strict";
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
exports.WalletTopUpRequest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const walletTopUpRequestStatus_enum_1 = require("../enums/financial/walletTopUpRequestStatus.enum");
const walletTopUpRejectionCode_enum_1 = require("../enums/financial/walletTopUpRejectionCode.enum");
const schema = new mongoose_1.Schema({
    topUpReference: { type: String, required: true, unique: true, immutable: true, trim: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true, min: 1, max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: Number.isSafeInteger } },
    currency: { type: String, required: true, immutable: true, uppercase: true, enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    status: { type: String, required: true, enum: Object.values(walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus), default: walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PENDING },
    idempotencyKey: { type: String, required: true, immutable: true, trim: true, lowercase: true },
    requestFingerprint: { type: String, required: true, immutable: true, select: false },
    requestedAt: { type: Date, required: true, immutable: true, default: Date.now },
    decidedAt: Date, decidedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    rejectionCode: { type: String, enum: Object.values(walletTopUpRejectionCode_enum_1.WalletTopUpRejectionCode) },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    providerPaymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "InternalPayment" }, paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Payment" }, completedAt: Date,
    providerFundingId: { type: mongoose_1.Schema.Types.ObjectId, ref: "InternalTopUpFunding", select: false }, providerFundingReference: { type: String, trim: true }, processingStartedAt: Date,
    ledgerEntryId: { type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry", select: false }, ledgerReference: { type: String, trim: true }, walletProjectionOperationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "WalletProjectionOperation", select: false }, walletProjectionOperationReference: { type: String, trim: true }, accountingTransactionId: { type: String, trim: true }, accountingCompletedAt: Date,
    failureCode: { type: String, trim: true, maxlength: 100 },
    failureReason: { type: String, trim: true, maxlength: 500 },
    providerFailedAt: Date,
    failureFinalizedAt: Date,
    failureFinalizedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
}, { timestamps: true, versionKey: false });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, requestedAt: -1 });
schema.index({ status: 1, requestedAt: 1 });
exports.WalletTopUpRequest = mongoose_1.default.model("WalletTopUpRequest", schema);
