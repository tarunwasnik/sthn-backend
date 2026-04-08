//backend/src/services/review/submitReview.service.ts

import mongoose from "mongoose";
import { Review } from "../../models/review.model";
import { Booking } from "../../models/booking.model";
import { CreatorProfile } from "../../models/creatorProfile.model";

interface SubmitReviewInput {
  bookingId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
  reportFlag?: boolean;
}

export const submitReviewService = async ({
  bookingId,
  reviewerId,
  rating,
  comment,
  reportFlag,
}: SubmitReviewInput) => {

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new Error("Invalid bookingId");
  }

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status !== "COMPLETED") {
      throw new Error("Reviews allowed only after completion");
    }

    let revieweeId: string;
    let role: "USER_TO_CREATOR" | "CREATOR_TO_USER";

    if (String(booking.userId) === reviewerId) {
      revieweeId = String(booking.creatorId);
      role = "USER_TO_CREATOR";
    } else if (String(booking.creatorId) === reviewerId) {
      revieweeId = String(booking.userId);
      role = "CREATOR_TO_USER";
    } else {
      throw new Error("You are not part of this booking");
    }

    const existingReview = await Review.findOne({
      bookingId,
      reviewerId,
    }).session(session);

    if (existingReview) {
      throw new Error("You already reviewed this booking");
    }

    /* =========================
       🔥 TRUST SYSTEM LOGIC
    ========================= */

    // ✅ Verified review (only completed booking allowed anyway)
    const verified = true;

    // ✅ Basic trust score calculation
    let trustScore = 1;

    // Short comment penalty
    if (!comment || comment.trim().length < 10) {
      trustScore -= 0.2;
    }

    // Extreme rating penalty
    if (rating === 1 || rating === 5) {
      trustScore -= 0.1;
    }

    // Clamp between 0–1
    trustScore = Math.max(0, Math.min(1, trustScore));

    // Report system defaults
    const reports = 0;
    const isFlagged = false;

    /* =========================
       CREATE REVIEW
    ========================= */

    const review = await Review.create(
      [
        {
          bookingId,
          reviewerId,
          revieweeId,
          role,
          rating,
          comment,
          reportFlag,

          // 🔥 NEW FIELDS
          verified,
          trustScore,
          reports,
          isFlagged,
        },
      ],
      { session }
    );

    /* =========================
       🔥 WEIGHTED RATING UPDATE
    ========================= */

    if (role === "USER_TO_CREATOR") {
      const creatorProfile = await CreatorProfile.findOne({
        userId: revieweeId,
      }).session(session);

      if (creatorProfile) {
        // ✅ Fetch all valid reviews (trusted only)
        const reviews = await Review.find({
          revieweeId,
          role: "USER_TO_CREATOR",
          trustScore: { $gte: 0.3 },
          isFlagged: { $ne: true },
        }).session(session);

        let weightedSum = 0;
        let totalWeight = 0;

        for (const r of reviews) {
          weightedSum += r.rating * (r.trustScore || 1);
          totalWeight += (r.trustScore || 1);
        }

        const newRating =
          totalWeight > 0 ? weightedSum / totalWeight : rating;

        creatorProfile.rating = newRating;
        creatorProfile.reviewCount = reviews.length;

        await creatorProfile.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    return review[0];

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};