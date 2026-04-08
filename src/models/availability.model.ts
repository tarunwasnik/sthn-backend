// backend/src/models/availability.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IAvailability extends Document {
  creatorId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;

  date: Date;

  startTime: string;
  endTime: string;

  slotDurationMinutes: number;

  status: "ACTIVE" | "CANCELLED" | "EXPIRED";

  createdAt: Date;
  updatedAt: Date;
}

const AvailabilitySchema = new Schema<IAvailability>(
  {
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

    date: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    slotDurationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: 30,
      max: 480,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

AvailabilitySchema.index({ creatorId: 1, date: 1 });
AvailabilitySchema.index({ creatorId: 1, serviceId: 1 });

/* Prevent duplicate availability windows */
AvailabilitySchema.index(
  { creatorId: 1, serviceId: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true }
);

export const Availability = mongoose.model<IAvailability>(
  "Availability",
  AvailabilitySchema
);