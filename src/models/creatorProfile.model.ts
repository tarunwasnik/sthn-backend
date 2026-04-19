// backend/src/models/creatorProfile.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { ZodNullableDef } from "zod/v3";

export type CreatorStatus =
  | "active"
  | "inactive"
  | "deactivated";

export interface CreatorProfileDocument extends Document {
  userId: mongoose.Types.ObjectId;

  slug: string;
  displayName: string;
  avatarUrl?: string | null;
  coverUrl:string | null;

  media?: string[];

  primaryCategory: string;
  categories?: string[];

  bio?: string | null;
  languages?: string[];

  country: string;
  city: string;

  currency: string;

  rating: number;
  reviewCount: number;

  status: CreatorStatus;
  creatorCooldownUntil?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const CreatorProfileSchema = new Schema<CreatorProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    avatarUrl: {
      type: String,
      default: null,
    },

    media: {
      type: [String],
      default: [],
    },

    primaryCategory: {
      type: String,
      required: true,
      index: true,
    },

    categories: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      default: null,
      trim: true,
    },

    languages: {
      type: [String],
      default: [],
    },

    /* ================= LOCATION ================= */

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

    rating: {
      type: Number,
      default: 0,
      min: 0,
    },

    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deactivated"],
      default: "inactive",
      index: true,
    },

    creatorCooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CreatorProfile = mongoose.model<CreatorProfileDocument>(
  "CreatorProfile",
  CreatorProfileSchema
);