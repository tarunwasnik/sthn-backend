// backend/src/models/booking.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

export interface IBooking extends Document {
  slotIds: mongoose.Types.ObjectId[];
  userId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;

  serviceId: mongoose.Types.ObjectId;
  /**
   * Immutable public CreatorService evidence captured when this booking was
   * created. Absent only for bookings created before DI-2A.
   */
  serviceSnapshot?: IBookingServiceSnapshot;

  /**
   * Financial Domain payment created for this booking.
   *
   * The legacy paymentStatus field remains for backward compatibility while
   * the Financial Domain Payment becomes the authoritative transaction record.
   */
  paymentId?: mongoose.Types.ObjectId;
  bookingReference?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  reservationReference?: string;
  fundsReservedAt?: Date;
  bookingRequestKey?: string;
  bookingRequestFingerprint?: string;

  serviceTitle: string;
  durationMinutes: number;
  price: number;
  serviceAmount: number;
  platformFeeAmount: number;
  commissionAmount: number;
  creatorAmount: number;
  totalAmount: number;
  currency: string;

  status:
    | "REQUESTED"
    | "CONFIRMED"
    | "REJECTED"
    | "CANCELLED"
    | "EXPIRED"
    | "COMPLETED";

  paymentStatus: "PENDING" | "PAID" | "REFUNDED";

  isPayable: boolean;
  isPayoutEligible: boolean;
  isFinancialLocked: boolean;

  creatorEarningSnapshot?: number;
  platformCommissionSnapshot?: number;

  expiresAt: Date;

  hasInteracted: boolean;
  interactionStartedAt?: Date;

  lastSeen: {
    user?: Date;
    creator?: Date;
  };

  completedAt?: Date; // ✅ NEW FIELD
  completionCause?: BookingWalletCaptureCause;
  completedByType?: BookingCompletionActorType;
  completedById?: mongoose.Types.ObjectId;
  completionOperationKey?: string;
  settlementEligibleAt?: Date;
  settlementId?: mongoose.Types.ObjectId;
  settledAt?: Date;

  terminationType?: BookingTerminationType;
  terminatedByType?: BookingTerminationActorType;
  terminatedById?: mongoose.Types.ObjectId;
  terminationReason?: string;
  terminationOperationKey?: string;
  terminatedAt?: Date;
  lifecycleVersion: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IBookingServiceSnapshot {
  serviceId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  durationMinutes: number;
  /** CreatorService's advertised major-unit price, not booking financial pricing. */
  price: number;
  currency: string;
  media: string[];
}

const BookingServiceSnapshotSchema = new Schema<IBookingServiceSnapshot>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: "CreatorService", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 480 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true },
    media: { type: [String], default: [] },
  },
  { _id: false, id: false },
);

const BookingSchema = new Schema<IBooking>(
  {
    slotIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Slot",
        required: true,
      },
    ],

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "CreatorService",
      required: true,
      index: true,
    },

    serviceSnapshot: {
      type: BookingServiceSnapshotSchema,
      immutable: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      index: true,
    },
    bookingReference: { type: String, trim: true, immutable: true },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod), immutable: true },
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
    completionCause: { type: String, enum: Object.values(BookingWalletCaptureCause), index: true },
    completedByType: { type: String, enum: Object.values(BookingCompletionActorType) },
    completedById: { type: Schema.Types.ObjectId, ref: "User" },
    completionOperationKey: { type: String, trim: true },
    settlementEligibleAt: { type: Date, index: true },
    settlementId: { type: Schema.Types.ObjectId, ref: "Settlement", index: true },
    settledAt: { type: Date, index: true },

    terminationType: { type: String, enum: Object.values(BookingTerminationType), index: true },
    terminatedByType: { type: String, enum: Object.values(BookingTerminationActorType) },
    terminatedById: { type: Schema.Types.ObjectId, ref: "User" },
    terminationReason: { type: String, trim: true, maxlength: 500 },
    terminationOperationKey: { type: String, trim: true },
    terminatedAt: { type: Date, index: true },
    lifecycleVersion: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

/* Indexes */

BookingSchema.index({ creatorId: 1, status: 1 });
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ slotIds: 1 });
BookingSchema.index(
  { userId: 1, bookingRequestKey: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingRequestKey: { $type: "string" } },
  },
);
BookingSchema.index(
  { bookingReference: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingReference: { $type: "string" } },
  },
);
BookingSchema.index(
  { reservationReference: 1 },
  {
    unique: true,
    partialFilterExpression: { reservationReference: { $type: "string" } },
  },
);
BookingSchema.index(
  { terminationOperationKey: 1 },
  { unique: true, partialFilterExpression: { terminationOperationKey: { $type: "string" } } },
);
BookingSchema.index(
  { completionOperationKey: 1 },
  { unique: true, partialFilterExpression: { completionOperationKey: { $type: "string" } } },
);

export const Booking = mongoose.model<IBooking>(
  "Booking",
  BookingSchema
);
