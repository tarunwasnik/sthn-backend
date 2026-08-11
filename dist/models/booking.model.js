"use strict";
// backend/src/models/booking.model.ts
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
exports.Booking = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const paymentMethod_enum_1 = require("../enums/financial/paymentMethod.enum");
const bookingWalletCaptureCause_enum_1 = require("../enums/financial/bookingWalletCaptureCause.enum");
const BookingSchema = new mongoose_1.Schema({
    slotIds: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Slot",
            required: true,
        },
    ],
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
    serviceId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "CreatorService",
        required: true,
        index: true,
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        index: true,
    },
    bookingReference: { type: String, trim: true, immutable: true },
    paymentMethod: { type: String, enum: Object.values(paymentMethod_enum_1.PaymentMethod), immutable: true },
    paymentReference: { type: String, trim: true },
    reservationReference: { type: String, trim: true },
    fundsReservedAt: { type: Date },
    bookingRequestKey: { type: String, trim: true, immutable: true, select: false },
    bookingRequestFingerprint: { type: String, trim: true, immutable: true, select: false },
    serviceTitle: {
        type: String,
        required: true,
        immutable: true,
    },
    durationMinutes: {
        type: Number,
        required: true,
        immutable: true,
    },
    price: {
        type: Number,
        required: true,
        immutable: true,
    },
    currency: {
        type: String,
        required: true,
        immutable: true,
    },
    status: {
        type: String,
        enum: [
            "REQUESTED",
            "CONFIRMED",
            "REJECTED",
            "CANCELLED",
            "EXPIRED",
            "COMPLETED",
        ],
        default: "REQUESTED",
        index: true,
    },
    paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "REFUNDED"],
        default: "PAID",
        index: true,
    },
    isPayable: {
        type: Boolean,
        default: false,
        index: true,
    },
    isPayoutEligible: {
        type: Boolean,
        default: false,
        index: true,
    },
    isFinancialLocked: {
        type: Boolean,
        default: false,
        index: true,
    },
    creatorEarningSnapshot: Number,
    platformCommissionSnapshot: Number,
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    hasInteracted: {
        type: Boolean,
        default: false,
        index: true,
    },
    interactionStartedAt: Date,
    lastSeen: {
        user: Date,
        creator: Date,
    },
    // ✅ ADD THIS BLOCK
    completedAt: {
        type: Date,
        index: true,
    },
    serviceAmount: {
        type: Number, required: true, immutable: true, min: 1,
        validate: { validator: Number.isSafeInteger,
            message: "Service amount must be a safe integer." },
    },
    platformFeeAmount: {
        type: Number, required: true, immutable: true, min: 0,
        validate: { validator: Number.isSafeInteger,
            message: "Platform fee amount must be a safe integer." },
    },
    commissionAmount: {
        type: Number, required: true, immutable: true, min: 0,
        validate: { validator: Number.isSafeInteger,
            message: "Commission amount must be a safe integer." },
    },
    creatorAmount: {
        type: Number, required: true, immutable: true, min: 1,
        validate: { validator: Number.isSafeInteger,
            message: "Creator amount must be a safe integer." },
    },
    totalAmount: {
        type: Number, required: true, immutable: true, min: 1,
        validate: { validator: Number.isSafeInteger,
            message: "Total amount must be a safe integer." },
    },
    completionCause: { type: String, enum: Object.values(bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause), index: true },
    completedByType: { type: String, enum: Object.values(bookingWalletCaptureCause_enum_1.BookingCompletionActorType) },
    completedById: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    completionOperationKey: { type: String, trim: true },
    settlementEligibleAt: { type: Date, index: true },
    settlementId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Settlement", index: true },
    settledAt: { type: Date, index: true },
    terminationType: { type: String, enum: Object.values(bookingTerminationType_enum_1.BookingTerminationType), index: true },
    terminatedByType: { type: String, enum: Object.values(bookingTerminationType_enum_1.BookingTerminationActorType) },
    terminatedById: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    terminationReason: { type: String, trim: true, maxlength: 500 },
    terminationOperationKey: { type: String, trim: true },
    terminatedAt: { type: Date, index: true },
    lifecycleVersion: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });
/* Indexes */
BookingSchema.index({ creatorId: 1, status: 1 });
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ slotIds: 1 });
BookingSchema.index({ userId: 1, bookingRequestKey: 1 }, {
    unique: true,
    partialFilterExpression: { bookingRequestKey: { $type: "string" } },
});
BookingSchema.index({ bookingReference: 1 }, {
    unique: true,
    partialFilterExpression: { bookingReference: { $type: "string" } },
});
BookingSchema.index({ reservationReference: 1 }, {
    unique: true,
    partialFilterExpression: { reservationReference: { $type: "string" } },
});
BookingSchema.index({ terminationOperationKey: 1 }, { unique: true, partialFilterExpression: { terminationOperationKey: { $type: "string" } } });
BookingSchema.index({ completionOperationKey: 1 }, { unique: true, partialFilterExpression: { completionOperationKey: { $type: "string" } } });
exports.Booking = mongoose_1.default.model("Booking", BookingSchema);
