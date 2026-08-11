"use strict";
// backend/src/models/payout.model.ts
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
exports.Payout = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const paymentProvider_enum_1 = require("../enums/financial/paymentProvider.enum");
const payoutStatus_enum_1 = require("../enums/financial/payoutStatus.enum");
const payoutSourceType_enum_1 = require("../enums/financial/payoutSourceType.enum");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const PayoutSchema = new mongoose_1.Schema({
    payoutReference: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
    },
    sourceType: {
        type: String,
        enum: Object.values(payoutSourceType_enum_1.PayoutSourceType),
        required: true,
        default: payoutSourceType_enum_1.PayoutSourceType.SETTLEMENT,
        immutable: true,
        index: true,
    },
    withdrawalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Withdrawal",
        index: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    settlementId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Settlement",
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
        enum: Object.values(payoutStatus_enum_1.PayoutStatus),
        default: payoutStatus_enum_1.PayoutStatus.CREATED,
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
    providerPayoutId: String,
    providerTransferId: String,
    beneficiaryId: String,
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
    initiatedAt: Date,
    completedAt: Date,
    failedAt: Date,
    providerPayload: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    attributes: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});
PayoutSchema.pre("validate", function () {
    if (this.sourceType === payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL) {
        if (!this.withdrawalId) {
            this.invalidate("withdrawalId", "Withdrawal payout requires withdrawalId.");
        }
        if (this.settlementId || this.bookingId || this.paymentId) {
            this.invalidate("sourceType", "Withdrawal payout cannot reference settlement, booking, or payment.");
        }
        return;
    }
    if (!this.settlementId || !this.bookingId || !this.paymentId) {
        this.invalidate("sourceType", "Settlement payout requires settlement, booking, and payment references.");
    }
});
/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */
PayoutSchema.index({ creatorId: 1, status: 1 });
PayoutSchema.index({ withdrawalId: 1 }, {
    unique: true,
    partialFilterExpression: {
        sourceType: payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL,
        withdrawalId: { $exists: true },
    },
});
PayoutSchema.index({ settlementId: 1, status: 1 });
PayoutSchema.index({ bookingId: 1 });
PayoutSchema.index({ paymentId: 1 });
PayoutSchema.index({ status: 1, createdAt: -1 });
PayoutSchema.index({ provider: 1, status: 1 });
PayoutSchema.index({ providerPayoutId: 1 });
PayoutSchema.index({ providerTransferId: 1 });
PayoutSchema.index({ completedAt: -1 });
exports.Payout = mongoose_1.default.model("Payout", PayoutSchema);
