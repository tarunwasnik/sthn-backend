import { Document, model, Schema, Types } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { BookingEscrowAllocationStatus } from "../enums/financial/bookingEscrowAllocationStatus.enum";

export interface BookingEscrowAllocationDocument extends Document {
  allocationReference: string;
  allocationKey: string;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  reservationId: Types.ObjectId;
  customerId: Types.ObjectId;
  creatorId: Types.ObjectId;
  bookingAmount: number;
  serviceAmount: number;
  platformFeeAmount: number;
  totalAmount: number;
  currency: SupportedCurrency;
  commissionRateBps: number;
  commissionAmount: number;
  creatorAmount: number;
  escrowLedgerTransaction: string;
  allocationLedgerTransaction: string;
  allocationLedgerEntryIds: Types.ObjectId[];
  allocationFingerprint: string;
  status: BookingEscrowAllocationStatus;
  allocatedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const safeMinorUnit = {
  validator: (value: number) => Number.isSafeInteger(value),
  message: "Allocation amount must be a safe integer minor-unit value.",
};

const BookingEscrowAllocationSchema =
  new Schema<BookingEscrowAllocationDocument>({
    allocationReference: { type: String, required: true, immutable: true, trim: true },
    allocationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      select: false,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      immutable: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      immutable: true,
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: "BookingFundReservation",
      required: true,
      immutable: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    bookingAmount: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
      validate: safeMinorUnit,
    },
    serviceAmount: {
      type: Number, required: true, immutable: true, min: 1,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    platformFeeAmount: {
      type: Number, required: true, immutable: true, min: 0,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    totalAmount: {
      type: Number, required: true, immutable: true, min: 1,
      max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: safeMinorUnit,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      enum: SUPPORTED_CURRENCIES,
    },
    commissionRateBps: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      max: 10_000,
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
      type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
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
      enum: Object.values(BookingEscrowAllocationStatus),
      required: true,
      default: BookingEscrowAllocationStatus.PENDING,
    },
    allocatedAt: Date,
    version: { type: Number, required: true, default: 0, min: 0 },
  }, { timestamps: true });

BookingEscrowAllocationSchema.index({ allocationReference: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ allocationKey: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ bookingId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ paymentId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index({ reservationId: 1 }, { unique: true });
BookingEscrowAllocationSchema.index(
  { escrowLedgerTransaction: 1 },
  { unique: true },
);
BookingEscrowAllocationSchema.index(
  { allocationLedgerTransaction: 1 },
  { unique: true },
);
BookingEscrowAllocationSchema.index({ creatorId: 1, status: 1 });
BookingEscrowAllocationSchema.index({ status: 1, allocatedAt: -1 });

export const BookingEscrowAllocation =
  model<BookingEscrowAllocationDocument>(
    "BookingEscrowAllocation",
    BookingEscrowAllocationSchema,
  );
