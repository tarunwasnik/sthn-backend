//backend/src/models/moderationQueue.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { ModerationSeverity } from "../services/moderationSeverity.service";

export interface IModerationQueue extends Document {
  bookingId: mongoose.Types.ObjectId;
  chatId: mongoose.Types.ObjectId;
  offenderId: mongoose.Types.ObjectId;
  severity: ModerationSeverity;
  reasons: string[];
  reviewed: boolean;
  createdAt: Date;
}

const ModerationQueueSchema = new Schema<IModerationQueue>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    offenderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      required: true,
      index: true,
    },
    reasons: {
      type: [String],
      default: [],
    },
    reviewed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export const ModerationQueue = mongoose.model<IModerationQueue>(
  "ModerationQueue",
  ModerationQueueSchema
);