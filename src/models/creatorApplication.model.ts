// backend/src/models/creatorApplication.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type CreatorApplicationStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export interface CreatorApplicationDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** Distinguishes the future direct-Creator flow from the verified-User upgrade. */
  applicationJourney: "user_upgrade" | "direct_creator";
  /** Optimistic-concurrency version for applicant-facing draft edits. */
  draftVersion: number;
  /** Future Creator face-capture sessions bind to this revision. */
  verificationRevision: number;

  displayName: string;
  primaryCategory?: string;
  interests?: string[];

  country: string;
  city: string;

  currency: string;

  services: string[];
  publicBio: string;

  languages: string[];

  /* ================= MEDIA ================= */

  avatarUrl?: string | null;
  coverUrl?: string | null;
  media?: string[];

  status: CreatorApplicationStatus;

  rejectionReason: string;

  submittedForReviewAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const CreatorApplicationSchema = new Schema<CreatorApplicationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    applicationJourney: { type: String, enum: ["user_upgrade", "direct_creator"], default: "user_upgrade", index: true },
    draftVersion: { type: Number, default: 0, min: 0 },
    verificationRevision: { type: Number, default: 0, min: 0 },

    displayName: {
      type: String,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
      trim: true,
    },

    primaryCategory: {
      type: String,
      index: true,
    },
    interests: { type: [String], default: [] },

    country: {
      type: String,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
      trim: true,
      index: true,
    },

    city: {
      type: String,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
      trim: true,
    },

    currency: {
      type: String,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
      uppercase: true,
      trim: true,
    },

    services: {
      type: [String],
      default: [],
    },

    publicBio: {
      type: String,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
      trim: true,
    },

    languages: {
      type: [String],
      default: [],
    },

    /* ================= MEDIA ================= */

    avatarUrl: {
      type: String,
      default: null,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
    },

    coverUrl: {
      type: String,
      default: null,
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
    },

    media: {
      type: [String],
      default: [],
      validate: {
        validator: function (value: string[]) {
          return (this as CreatorApplicationDocument).status === "draft" || (value.length >= 2 && value.length <= 6);
        },
        message: "Gallery must contain between 2 and 6 images",
      },
      required: function (this: CreatorApplicationDocument) { return this.status !== "draft"; },
    },

    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
      index: true,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    submittedForReviewAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

export const CreatorApplication = mongoose.model<CreatorApplicationDocument>(
  "CreatorApplication",
  CreatorApplicationSchema,
);
