"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingEscrowAllocation = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const bookingEscrowAllocationStatus_enum_1 = require("../enums/financial/bookingEscrowAllocationStatus.enum");
const safeMinorUnit = {
    validator: (value) => Number.isSafeInteger(value),
    message: "Allocation amount must be a safe integer minor-unit value.",
};
const BookingEscrowAllocationSchema = new mongoose_1.Schema({
    allocationReference: { type: String, required: true, immutable: true, trim: true },
    allocationKey: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        select: false,
    },
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        immutable: true,
    },
    paymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
        immutable: true,
    },
    reservationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BookingFundReservation",
        required: true,
        immutable: true,
    },
    customerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
    },
    bookingAmount: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: safeMinorUnit,
    },
    serviceAmount: {
        type: Number, required: true, immutable: true, min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    platformFeeAmount: {
        type: Number, required: true, immutable: true, min: 0,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    totalAmount: {
        type: Number, required: true, immutable: true, min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    currency: {
        type: String,
        required: true,
        immutable: true,
        uppercase: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    commissionRateBps: {
        type: Number,
        required: true,
        immutable: true,
        min: 0,
        max: 10000,
        validate: safeMinorUnit,
    },
    commissionAmount: {
        type: Number,
        required: true,
        immutable: true,
        min: 0,
        validate: safeMinorUnit,
    },
    creatorAmount: {
        type: Number,
        required: true,
        immutable: true,
        min: 0,
        validate: safeMinorUnit,
    },
    escrowLedgerTransaction: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        select: false,
    },
    allocationLedgerTransaction: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        select: false,
    },
    allocationLedgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [],
        select: false,
    },
    allocationFingerprint: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        select: false,
    },
    status: {
        type: String,
        enum: Object.values(bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus),
        required: true,
        default: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.PENDING,
    },
    allocatedAt: Date,
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });
BookingEscrowAllocationSchema.index({ allocationReference: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ allocationKey: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ bookingId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ paymentId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ reservationId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ escrowLedgerTransaction: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ allocationLedgerTransaction: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ creatorId: 1, status: 1 });
BookingEscrowAllocationSchema.index({ status: 1, allocatedAt: -1 });
exports.BookingEscrowAllocation = (0, mongoose_1.model)("BookingEscrowAllocation", BookingEscrowAllocationSchema);
