"use strict";
// backend/src/models/payment.model.ts
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
exports.Payment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const paymentFailureReason_enum_1 = require("../enums/financial/paymentFailureReason.enum");
const paymentMethod_enum_1 = require("../enums/financial/paymentMethod.enum");
const paymentProvider_enum_1 = require("../enums/financial/paymentProvider.enum");
const paymentStatus_enum_1 = require("../enums/financial/paymentStatus.enum");
const paymentPricingPolicy_enum_1 = require("../enums/financial/paymentPricingPolicy.enum");
const financialReconciliationStatus_enum_1 = require("../enums/financial/financialReconciliationStatus.enum");
const financialReconciliationReason_enum_1 = require("../enums/financial/financialReconciliationReason.enum");
const bookingWalletReleaseCause_enum_1 = require("../enums/financial/bookingWalletReleaseCause.enum");
const bookingWalletCaptureCause_enum_1 = require("../enums/financial/bookingWalletCaptureCause.enum");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const PaymentSchema = new mongoose_1.Schema({
    paymentReference: {
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
        immutable: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
        index: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        immutable: true,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Payment amount must be a safe integer minor-unit value.",
        },
    },
    currency: {
        type: String,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
        required: true,
        uppercase: true,
        immutable: true,
    },
    provider: {
        type: String,
        enum: Object.values(paymentProvider_enum_1.PaymentProvider),
        default: paymentProvider_enum_1.PaymentProvider.INTERNAL,
        required: true,
        index: true,
    },
    method: {
        type: String,
        enum: Object.values(paymentMethod_enum_1.PaymentMethod),
        default: paymentMethod_enum_1.PaymentMethod.INTERNAL,
        required: true,
    },
    status: {
        type: String,
        enum: Object.values(paymentStatus_enum_1.PaymentStatus),
        default: paymentStatus_enum_1.PaymentStatus.CREATED,
        required: true,
        index: true,
    },
    providerPaymentId: String,
    providerOrderId: String,
    providerTransactionId: String,
    authorizationId: String,
    settlementId: String,
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", select: false },
    reservationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "BookingFundReservation", select: false },
    reservationReference: { type: String, trim: true },
    authorizedAmount: {
        type: Number,
        min: 1,
        validate: {
            validator: (value) => value === undefined || Number.isSafeInteger(value),
            message: "Authorized amount must be a safe integer minor-unit value.",
        },
    },
    authorizedAt: { type: Date, index: true },
    releaseReference: { type: String, trim: true },
    releasedAmount: {
        type: Number,
        min: 1,
        validate: {
            validator: (value) => value === undefined || Number.isSafeInteger(value),
            message: "Released amount must be a safe integer minor-unit value.",
        },
    },
    releaseCause: { type: String, enum: Object.values(bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause) },
    releasedAt: { type: Date, index: true },
    captureReference: { type: String, trim: true },
    capturedAmount: {
        type: Number,
        min: 1,
        validate: {
            validator: (value) => value === undefined || Number.isSafeInteger(value),
            message: "Captured amount must be a safe integer minor-unit value.",
        },
    },
    captureCause: { type: String, enum: Object.values(bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause) },
    capturedAt: { type: Date, index: true },
    attemptNumber: {
        type: Number,
        default: 1,
        min: 1,
    },
    retryable: {
        type: Boolean,
        default: true,
    },
    failureReason: {
        type: String,
        enum: Object.values(paymentFailureReason_enum_1.PaymentFailureReason),
        default: paymentFailureReason_enum_1.PaymentFailureReason.NONE,
    },
    failureMessage: String,
    idempotencyKey: {
        type: String,
        required: true,
        index: true,
        immutable: true,
    },
    serviceAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value) => value === undefined || Number.isSafeInteger(value), message: "Service amount must be a safe integer." } },
    customerFeeRateBps: { type: Number, immutable: true, min: 0, max: 10000, validate: { validator: (value) => value === undefined || Number.isSafeInteger(value), message: "Customer fee rate must be a safe integer." } },
    customerFeeAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value) => value === undefined || Number.isSafeInteger(value), message: "Customer fee amount must be a safe integer." } },
    grossEscrowAmount: { type: Number, immutable: true, min: 0, validate: { validator: (value) => value === undefined || Number.isSafeInteger(value), message: "Gross escrow amount must be a safe integer." } },
    pricingPolicy: { type: String, enum: Object.values(paymentPricingPolicy_enum_1.PaymentPricingPolicy), immutable: true, index: true },
    pricingVersion: { type: Number, immutable: true, min: 0, validate: { validator: (value) => value === undefined || Number.isSafeInteger(value), message: "Pricing version must be a safe integer." } },
    pricingCalculatedAt: { type: Date, immutable: true },
    escrowRecognizedAt: { type: Date, index: true },
    escrowLedgerTransactionReference: { type: String, trim: true, sparse: true, index: true },
    reconciliationStatus: { type: String, enum: Object.values(financialReconciliationStatus_enum_1.FinancialReconciliationStatus), index: true },
    reconciliationReason: { type: String, enum: Object.values(financialReconciliationReason_enum_1.FinancialReconciliationReason) },
    reconciliationNote: { type: String, trim: true, maxlength: 500 },
    automaticSettlementBlocked: { type: Boolean, default: false, index: true },
    lifecycleVersion: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
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
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */
PaymentSchema.index({ bookingId: 1, status: 1 });
PaymentSchema.index({ creatorId: 1, status: 1 });
PaymentSchema.index({ userId: 1, status: 1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ provider: 1, status: 1 });
PaymentSchema.index({ bookingId: 1 }, { unique: true });
PaymentSchema.index({ provider: 1, providerPaymentId: 1 }, {
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: "string" } },
});
PaymentSchema.index({ providerOrderId: 1 });
PaymentSchema.index({ providerTransactionId: 1 });
PaymentSchema.index({ settlementId: 1 });
PaymentSchema.index({ reconciliationStatus: 1, status: 1 });
PaymentSchema.index({ automaticSettlementBlocked: 1, escrowRecognizedAt: 1, status: 1 });
exports.Payment = mongoose_1.default.model("Payment", PaymentSchema);
