"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingFundReservation = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const bookingFundReservationStatus_enum_1 = require("../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletReleaseCause_enum_1 = require("../enums/financial/bookingWalletReleaseCause.enum");
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingWalletCaptureCause_enum_1 = require("../enums/financial/bookingWalletCaptureCause.enum");
const BookingFundReservationSchema = new mongoose_1.Schema({
    reservationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
    reservationKey: { type: String, required: true, immutable: true, unique: true, trim: true, select: false },
    bookingId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
    bookingReference: { type: String, required: true, immutable: true, trim: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Payment", required: true, immutable: true },
    paymentReference: { type: String, required: true, immutable: true, trim: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
    creatorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    serviceId: { type: mongoose_1.Schema.Types.ObjectId, ref: "CreatorService", required: true, immutable: true },
    amount: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
        max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Reservation amount must be a positive safe integer minor-unit value.",
        },
    },
    currency: { type: String, required: true, immutable: true, uppercase: true, enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    status: {
        type: String,
        required: true,
        enum: Object.values(bookingFundReservationStatus_enum_1.BookingFundReservationStatus),
        default: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.PENDING,
    },
    ledgerTransactionId: { type: String, trim: true, select: false },
    ledgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [],
        select: false,
    },
    projectionOperationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "WalletProjectionOperation", select: false },
    projectionOperationReference: { type: String, trim: true, select: false },
    authorizedAt: Date,
    releasedAt: Date,
    releaseReference: { type: String, trim: true },
    releaseKey: { type: String, trim: true, select: false },
    releaseTransactionId: { type: String, trim: true, select: false },
    releaseLedgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [],
        select: false,
    },
    releaseProjectionOperationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "WalletProjectionOperation",
        select: false,
    },
    releaseProjectionOperationReference: { type: String, trim: true, select: false },
    releaseCause: { type: String, enum: Object.values(bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause) },
    capturedAt: Date,
    captureKey: { type: String, trim: true, select: false },
    captureTransactionId: { type: String, trim: true, select: false },
    captureLedgerEntryIds: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }],
        default: [],
        select: false,
    },
    captureProjectionOperationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "WalletProjectionOperation",
        select: false,
    },
    captureProjectionOperationReference: { type: String, trim: true, select: false },
    captureCause: { type: String, enum: Object.values(bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause) },
    capturedByType: { type: String, enum: Object.values(bookingWalletCaptureCause_enum_1.BookingCompletionActorType) },
    capturedById: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    captureFingerprint: { type: String, trim: true, select: false },
    releaseReason: { type: String, trim: true },
    releasedByType: { type: String, enum: Object.values(bookingTerminationType_enum_1.BookingTerminationActorType) },
    releasedById: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", select: false },
    releaseFingerprint: { type: String, trim: true, select: false },
    captureReference: { type: String, trim: true },
    requestFingerprint: { type: String, required: true, immutable: true, trim: true, select: false },
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });
BookingFundReservationSchema.index({ bookingId: 1 }, { unique: true });
BookingFundReservationSchema.index({ paymentId: 1 }, { unique: true });
BookingFundReservationSchema.index({ ledgerTransactionId: 1 }, { unique: true, partialFilterExpression: { ledgerTransactionId: { $type: "string" } } });
BookingFundReservationSchema.index({ projectionOperationReference: 1 }, { unique: true, partialFilterExpression: { projectionOperationReference: { $type: "string" } } });
BookingFundReservationSchema.index({ userId: 1, status: 1 });
BookingFundReservationSchema.index({ walletId: 1, status: 1 });
BookingFundReservationSchema.index({ paymentReference: 1 });
BookingFundReservationSchema.index({ createdAt: -1 });
BookingFundReservationSchema.index({ releaseReference: 1 }, { unique: true, partialFilterExpression: { releaseReference: { $type: "string" } } });
BookingFundReservationSchema.index({ releaseKey: 1 }, { unique: true, partialFilterExpression: { releaseKey: { $type: "string" } } });
BookingFundReservationSchema.index({ releaseTransactionId: 1 }, { unique: true, partialFilterExpression: { releaseTransactionId: { $type: "string" } } });
BookingFundReservationSchema.index({ releaseProjectionOperationReference: 1 }, {
    unique: true,
    partialFilterExpression: {
        releaseProjectionOperationReference: { $type: "string" },
    },
});
BookingFundReservationSchema.index({ status: 1, releasedAt: -1 });
BookingFundReservationSchema.index({ captureReference: 1 }, { unique: true, partialFilterExpression: { captureReference: { $type: "string" } } });
BookingFundReservationSchema.index({ captureKey: 1 }, { unique: true, partialFilterExpression: { captureKey: { $type: "string" } } });
BookingFundReservationSchema.index({ captureTransactionId: 1 }, { unique: true, partialFilterExpression: { captureTransactionId: { $type: "string" } } });
BookingFundReservationSchema.index({ captureProjectionOperationReference: 1 }, {
    unique: true,
    partialFilterExpression: {
        captureProjectionOperationReference: { $type: "string" },
    },
});
BookingFundReservationSchema.index({ status: 1, capturedAt: -1 });
exports.BookingFundReservation = (0, mongoose_1.model)("BookingFundReservation", BookingFundReservationSchema);
