//backend/src/models/review.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  bookingId: mongoose.Types.ObjectId;

  reviewerId: mongoose.Types.ObjectId;
  revieweeId: mongoose.Types.ObjectId;

  role: "USER_TO_CREATOR" | "CREATOR_TO_USER";

  rating: number;
  comment?: string;

  reportFlag?: boolean;

  // 🔥 TRUST SYSTEM FIELDS (NEW)
  verified: boolean;        // from completed booking
  trustScore: number;       // 0 → 1
  reports: number;          // count of reports
  isFlagged: boolean;       // auto moderation

  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    revieweeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["USER_TO_CREATOR", "CREATOR_TO_USER"],
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      index: true,
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    reportFlag: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* =========================
       🔥 TRUST SYSTEM FIELDS
    ========================= */

    verified: {
      type: Boolean,
      default: false,
      index: true,
    },

    trustScore: {
      type: Number,
      default: 1,
      min: 0,
      max: 1,
      index: true,
    },

    reports: {
      type: Number,
      default: 0,
    },

    isFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * Prevent duplicate reviews from same reviewer
 */
ReviewSchema.index(
  { bookingId: 1, reviewerId: 1 },
  { unique: true }
);

/**
 * 🔥 Optimized compound index for queries
 */
ReviewSchema.index({
  revieweeId: 1,
  role: 1,
  trustScore: 1,
  isFlagged: 1,
  createdAt: -1,
});

export const Review = mongoose.model<IReview>(
  "Review",
  ReviewSchema
);