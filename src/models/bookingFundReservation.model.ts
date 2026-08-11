import { Document, model, Schema, Types } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { BookingFundReservationStatus } from "../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletReleaseCause } from "../enums/financial/bookingWalletReleaseCause.enum";
import { BookingTerminationActorType } from "../enums/booking/bookingTerminationType.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

export interface BookingFundReservationDocument extends Document {
  reservationReference: string;
  reservationKey: string;
  bookingId: Types.ObjectId;
  bookingReference: string;
  paymentId: Types.ObjectId;
  paymentReference: string;
  userId: Types.ObjectId;
  walletId: Types.ObjectId;
  creatorId: Types.ObjectId;
  serviceId: Types.ObjectId;
  amount: number;
  currency: SupportedCurrency;
  status: BookingFundReservationStatus;
  ledgerTransactionId?: string;
  ledgerEntryIds: Types.ObjectId[];
  projectionOperationId?: Types.ObjectId;
  projectionOperationReference?: string;
  authorizedAt?: Date;
  releasedAt?: Date;
  releaseReference?: string;
  releaseKey?: string;
  releaseTransactionId?: string;
  releaseLedgerEntryIds: Types.ObjectId[];
  releaseProjectionOperationId?: Types.ObjectId;
  releaseProjectionOperationReference?: string;
  releaseCause?: BookingWalletReleaseCause;
  capturedAt?: Date;
  captureKey?: string;
  captureTransactionId?: string;
  captureLedgerEntryIds: Types.ObjectId[];
  captureProjectionOperationId?: Types.ObjectId;
  captureProjectionOperationReference?: string;
  captureCause?: BookingWalletCaptureCause;
  capturedByType?: BookingCompletionActorType;
  capturedById?: Types.ObjectId;
  captureFingerprint?: string;
  releaseReason?: string;
  releasedByType?: BookingTerminationActorType;
  releasedById?: Types.ObjectId;
  releaseFingerprint?: string;
  captureReference?: string;
  requestFingerprint: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const BookingFundReservationSchema = new Schema<BookingFundReservationDocument>(
  {
    reservationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
    reservationKey: { type: String, required: true, immutable: true, unique: true, trim: true, select: false },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
    bookingReference: { type: String, required: true, immutable: true, trim: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, immutable: true },
    paymentReference: { type: String, required: true, immutable: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, select: false },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "CreatorService", required: true, immutable: true },
    amount: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Reservation amount must be a positive safe integer minor-unit value.",
      },
    },
    currency: { type: String, required: true, immutable: true, uppercase: true, enum: SUPPORTED_CURRENCIES },
    status: {
      type: String,
      required: true,
      enum: Object.values(BookingFundReservationStatus),
      default: BookingFundReservationStatus.PENDING,
    },
    ledgerTransactionId: { type: String, trim: true, select: false },
    ledgerEntryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
      default: [],
      select: false,
    },
    projectionOperationId: { type: Schema.Types.ObjectId, ref: "WalletProjectionOperation", select: false },
    projectionOperationReference: { type: String, trim: true, select: false },
    authorizedAt: Date,
    releasedAt: Date,
    releaseReference: { type: String, trim: true },
    releaseKey: { type: String, trim: true, select: false },
    releaseTransactionId: { type: String, trim: true, select: false },
    releaseLedgerEntryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
      default: [],
      select: false,
    },
    releaseProjectionOperationId: {
      type: Schema.Types.ObjectId,
      ref: "WalletProjectionOperation",
      select: false,
    },
    releaseProjectionOperationReference: { type: String, trim: true, select: false },
    releaseCause: { type: String, enum: Object.values(BookingWalletReleaseCause) },
    capturedAt: Date,
    captureKey: { type: String, trim: true, select: false },
    captureTransactionId: { type: String, trim: true, select: false },
    captureLedgerEntryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
      default: [],
      select: false,
    },
    captureProjectionOperationId: {
      type: Schema.Types.ObjectId,
      ref: "WalletProjectionOperation",
      select: false,
    },
    captureProjectionOperationReference: { type: String, trim: true, select: false },
    captureCause: { type: String, enum: Object.values(BookingWalletCaptureCause) },
    capturedByType: { type: String, enum: Object.values(BookingCompletionActorType) },
    capturedById: { type: Schema.Types.ObjectId, ref: "User", select: false },
    captureFingerprint: { type: String, trim: true, select: false },
    releaseReason: { type: String, trim: true },
    releasedByType: { type: String, enum: Object.values(BookingTerminationActorType) },
    releasedById: { type: Schema.Types.ObjectId, ref: "User", select: false },
    releaseFingerprint: { type: String, trim: true, select: false },
    captureReference: { type: String, trim: true },
    requestFingerprint: { type: String, required: true, immutable: true, trim: true, select: false },
    version: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

BookingFundReservationSchema.index({ bookingId: 1 }, { unique: true });
BookingFundReservationSchema.index({ paymentId: 1 }, { unique: true });
BookingFundReservationSchema.index(
  { ledgerTransactionId: 1 },
  { unique: true, partialFilterExpression: { ledgerTransactionId: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { projectionOperationReference: 1 },
  { unique: true, partialFilterExpression: { projectionOperationReference: { $type: "string" } } },
);
BookingFundReservationSchema.index({ userId: 1, status: 1 });
BookingFundReservationSchema.index({ walletId: 1, status: 1 });
BookingFundReservationSchema.index({ paymentReference: 1 });
BookingFundReservationSchema.index({ createdAt: -1 });
BookingFundReservationSchema.index(
  { releaseReference: 1 },
  { unique: true, partialFilterExpression: { releaseReference: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { releaseKey: 1 },
  { unique: true, partialFilterExpression: { releaseKey: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { releaseTransactionId: 1 },
  { unique: true, partialFilterExpression: { releaseTransactionId: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { releaseProjectionOperationReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      releaseProjectionOperationReference: { $type: "string" },
    },
  },
);
BookingFundReservationSchema.index({ status: 1, releasedAt: -1 });
BookingFundReservationSchema.index(
  { captureReference: 1 },
  { unique: true, partialFilterExpression: { captureReference: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { captureKey: 1 },
  { unique: true, partialFilterExpression: { captureKey: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { captureTransactionId: 1 },
  { unique: true, partialFilterExpression: { captureTransactionId: { $type: "string" } } },
);
BookingFundReservationSchema.index(
  { captureProjectionOperationReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      captureProjectionOperationReference: { $type: "string" },
    },
  },
);
BookingFundReservationSchema.index({ status: 1, capturedAt: -1 });

export const BookingFundReservation = model<BookingFundReservationDocument>(
  "BookingFundReservation",
  BookingFundReservationSchema,
);
