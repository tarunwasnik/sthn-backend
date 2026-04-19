// backend/src/models/creatorApplication.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type CreatorApplicationStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export interface CreatorApplicationDocument extends Document {
  userId: mongoose.Types.ObjectId;

  displayName: string;
  primaryCategory: string;

  country: string;
  city: string;

  currency: string;

  services: string[];
  publicBio: string;

  languages: string[];

  status: CreatorApplicationStatus;

  createdAt: Date;
  updatedAt: Date;
}

const CreatorApplicationSchema =
  new Schema<CreatorApplicationDocument>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      displayName: {
        type: String,
        required: true,
        trim: true,
      },

      primaryCategory: {
        type: String,
        required: true,
        index: true,
      },

      country: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
      },

      currency: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
      },

      services: {
        type: [String],
        default: [],
      },

      publicBio: {
        type: String,
        required: true,
        trim: true,
      },

      languages: {
        type: [String],
        default: [],
      },

      status: {
        type: String,
        enum: ["draft", "submitted", "approved", "rejected"],
        default: "draft",
        index: true,
      },
    },
    { timestamps: true }
  );

export const CreatorApplication =
  mongoose.model<CreatorApplicationDocument>(
    "CreatorApplication",
    CreatorApplicationSchema
  );