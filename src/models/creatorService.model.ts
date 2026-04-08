//backend/src/models/creatorService.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface CreatorServiceDocument extends Document {
  creatorId: mongoose.Types.ObjectId;

  title: string;
  description: string;

  durationMinutes: number;
  price: number;

  media?: string[];

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const CreatorServiceSchema = new Schema<CreatorServiceDocument>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
      max: 480,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    media: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup for active services per creator
CreatorServiceSchema.index({ creatorId: 1, isActive: 1 });

export const CreatorService = mongoose.model<CreatorServiceDocument>(
  "CreatorService",
  CreatorServiceSchema
);