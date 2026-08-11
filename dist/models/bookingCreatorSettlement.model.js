"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingCreatorSettlement = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const bookingCreatorSettlementStatus_enum_1 = require("../enums/financial/bookingCreatorSettlementStatus.enum");
const positiveMinorUnit = {
    type: Number,
    required: true,
    immutable: true,
    min: 1,
    max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: "Settlement amount must be a positive safe integer minor-unit value.",
    },
};
const nonNegativeMinorUnit = {
    type: Number,
    required: true,
    immutable: true,
    min: 0,
    max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: "Settlement amount must be a non-negative safe integer minor-unit value.",
    },
};
const immutableObjectId = (ref) => ({
    type: mongoose_1.Schema.Types.ObjectId,
    ref,
    required: true,
    immutable: true,
});
const hiddenString = {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    select: false,
};
const BookingCreatorSettlementSchema = new mongoose_1.Schema({
    settlementReference: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
    },
    settlementKey: hiddenString,
    bookingId: immutableObjectId("Booking"),
    paymentId: immutableObjectId("Payment"),
    reservationId: immutableObjectId("BookingFundReservation"),
    allocationId: immutableObjectId("BookingEscrowAllocation"),
    customerUserId: immutableObjectId("User"),
    creatorId: immutableObjectId("CreatorProfile"),
    creatorUserId: immutableObjectId("User"),
    creatorWalletId: immutableObjectId("Wallet"),
    bookingAmount: positiveMinorUnit,
    currency: {
        type: String,
        required: true,
        immutable: true,
        uppercase: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    commissionAmount: nonNegativeMinorUnit,
    creatorAmount: positiveMinorUnit,
    captureTransactionId: hiddenString,
    allocationTransactionId: hiddenString,
    settlementTransactionId: hiddenString,
    settlementFingerprint: hiddenString,
    settlementProjectionOperationReference: hiddenString,
    settlementLedgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [],
        select: false,
    },
    status: {
        type: String,
        enum: Object.values(bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus),
        required: true,
        default: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
    },
    settledAt: Date,
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });
BookingCreatorSettlementSchema.index({ settlementReference: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ settlementKey: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ allocationId: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ bookingId: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ paymentId: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ reservationId: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ settlementTransactionId: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ settlementProjectionOperationReference: 1 }, { unique: true });
BookingCreatorSettlementSchema.index({ status: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorId: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorUserId: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorWalletId: 1, settledAt: -1 });
exports.BookingCreatorSettlement = (0, mongoose_1.model)("BookingCreatorSettlement", BookingCreatorSettlementSchema);
