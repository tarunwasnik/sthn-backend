// backend/src/models/booking.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IBooking extends Document {
  slotIds: mongoose.Types.ObjectId[];
  userId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;

  serviceId: mongoose.Types.ObjectId;

  serviceTitle: string;
  durationMinutes: number;
  price: number;
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

  createdAt: Date;
  updatedAt: Date;
}

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
  },
  { timestamps: true }
);

/* Indexes */

BookingSchema.index({ creatorId: 1, status: 1 });
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ slotIds: 1 });
BookingSchema.index({ serviceId: 1 });

export const Booking = mongoose.model<IBooking>(
  "Booking",
  BookingSchema
);