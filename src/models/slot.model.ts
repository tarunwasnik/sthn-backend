// backend/src/models/slot.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface ISlot extends Document {
  availabilityId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;

  startTime: Date;
  endTime: Date;

  status: "AVAILABLE" | "LOCKED" | "BOOKED" | "CANCELLED";

  price: number;

  createdAt: Date;
  updatedAt: Date;
}

const SlotSchema = new Schema<ISlot>(
  {
    availabilityId: {
      type: Schema.Types.ObjectId,
      ref: "Availability",
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

    startTime: {
      type: Date,
      required: true,
      index: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["AVAILABLE", "LOCKED", "BOOKED", "CANCELLED"],
      default: "AVAILABLE",
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * 🔐 HARD SAFETY GUARANTEE
 * Prevent duplicate slot start times for the same creator
 */
SlotSchema.index(
  { creatorId: 1, startTime: 1 },
  { unique: true }
);

/**
 * ⚡ Discovery & Availability Queries
 */
SlotSchema.index(
  { creatorId: 1, status: 1, startTime: 1 }
);

/**
 * ⚡ Booking Lock Queries
 */
SlotSchema.index(
  { status: 1, startTime: 1 }
);

/**
 * ⚡ Service based queries
 */
SlotSchema.index(
  { serviceId: 1, status: 1, startTime: 1 }
);

export const Slot = mongoose.model<ISlot>("Slot", SlotSchema);