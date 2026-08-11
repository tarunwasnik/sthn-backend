"use strict";
// backend/src/models/refund.model.ts
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
exports.Refund = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const paymentProvider_enum_1 = require("../enums/financial/paymentProvider.enum");
const refundReason_enum_1 = require("../enums/financial/refundReason.enum");
const refundStatus_enum_1 = require("../enums/financial/refundStatus.enum");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const RefundSchema = new mongoose_1.Schema({
    refundReference: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        index: true,
        trim: true,
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
        index: true,
    },
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
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
        enum: Object.values(refundStatus_enum_1.RefundStatus),
        default: refundStatus_enum_1.RefundStatus.CREATED,
        required: true,
        index: true,
    },
    reason: {
        type: String,
        enum: Object.values(refundReason_enum_1.RefundReason),
        default: refundReason_enum_1.RefundReason.OTHER,
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
    providerRefundId: String,
    providerPaymentId: String,
    settlementId: String,
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
    providerPayload: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    attributes: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});
/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */
RefundSchema.index({ paymentId: 1, status: 1 });
RefundSchema.index({ bookingId: 1, status: 1 });
RefundSchema.index({ userId: 1, status: 1 });
RefundSchema.index({ creatorId: 1, status: 1 });
RefundSchema.index({ status: 1, createdAt: -1 });
RefundSchema.index({ provider: 1, status: 1 });
RefundSchema.index({ providerRefundId: 1 });
RefundSchema.index({ settlementId: 1 });
exports.Refund = mongoose_1.default.model("Refund", RefundSchema);
