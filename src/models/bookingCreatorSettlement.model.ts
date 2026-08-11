import { Document, model, Schema, Types } from "mongoose";

import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../constants/financial/supportedCurrencies";
import { FINANCIAL_LIMITS } from "../constants/financial/financialLimits";
import { BookingCreatorSettlementStatus } from "../enums/financial/bookingCreatorSettlementStatus.enum";

export interface BookingCreatorSettlementDocument extends Document {
  settlementReference: string;
  settlementKey: string;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  reservationId: Types.ObjectId;
  allocationId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  creatorId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  creatorWalletId: Types.ObjectId;
  bookingAmount: number;
  currency: SupportedCurrency;
  commissionAmount: number;
  creatorAmount: number;
  captureTransactionId: string;
  allocationTransactionId: string;
  settlementTransactionId: string;
  settlementFingerprint: string;
  settlementProjectionOperationReference: string;
  settlementLedgerEntryIds: Types.ObjectId[];
  status: BookingCreatorSettlementStatus;
  settledAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const positiveMinorUnit = {
  type: Number,
  required: true,
  immutable: true,
  min: 1,
  max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: "Settlement amount must be a positive safe integer minor-unit value.",
  },
};

const nonNegativeMinorUnit = {
  type: Number,
  required: true,
  immutable: true,
  min: 0,
  max: FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
  validate: {
    validator: (value: number) => Number.isSafeInteger(value),
    message: "Settlement amount must be a non-negative safe integer minor-unit value.",
  },
};

const immutableObjectId = (ref: string) => ({
  type: Schema.Types.ObjectId,
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

const BookingCreatorSettlementSchema =
  new Schema<BookingCreatorSettlementDocument>({
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
      enum: SUPPORTED_CURRENCIES,
    },
    commissionAmount: nonNegativeMinorUnit,
    creatorAmount: positiveMinorUnit,
    captureTransactionId: hiddenString,
    allocationTransactionId: hiddenString,
    settlementTransactionId: hiddenString,
    settlementFingerprint: hiddenString,
    settlementProjectionOperationReference: hiddenString,
    settlementLedgerEntryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "LedgerEntry" }],
      default: [],
      select: false,
    },
    status: {
      type: String,
      enum: Object.values(BookingCreatorSettlementStatus),
      required: true,
      default: BookingCreatorSettlementStatus.PENDING,
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
BookingCreatorSettlementSchema.index(
  { settlementTransactionId: 1 },
  { unique: true },
);
BookingCreatorSettlementSchema.index(
  { settlementProjectionOperationReference: 1 },
  { unique: true },
);
BookingCreatorSettlementSchema.index({ status: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorId: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorUserId: 1, settledAt: -1 });
BookingCreatorSettlementSchema.index({ creatorWalletId: 1, settledAt: -1 });

export const BookingCreatorSettlement =
  model<BookingCreatorSettlementDocument>(
    "BookingCreatorSettlement",
    BookingCreatorSettlementSchema,
  );
