// backend/src/controllers/review.controller.ts

import { Request, Response } from "express";
import { submitReviewService } from "../services/review/submitReview.service";
import { Review } from "../models/review.model";
import { Booking } from "../models/booking.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { UserProfile } from "../models/userProfile.model";
import mongoose from "mongoose";

type AuthenticatedRequest = Request & { user?: { id: string } };

/* =========================
   SUBMIT REVIEW
========================= */

export const submitReview = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const { bookingId } = req.params;
  const { rating, comment, reportFlag } = req.body;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const review = await submitReviewService({
      bookingId,
      reviewerId: user.id,
      rating,
      comment,
      reportFlag,
    });

    return res.status(201).json({
      message: "Review submitted successfully",
      review,
    });

  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Failed to submit review",
    });
  }
};


/* =========================
   GET REVIEWS FOR CREATOR (PAGINATED + TRUST FILTER)
========================= */

export const getReviewsForCreator = async (req: Request, res: Response) => {
  try {
    const { creatorId } = req.params;

    if (!creatorId || !mongoose.Types.ObjectId.isValid(creatorId)) {
      return res.status(400).json({
        message: "Invalid creatorId",
      });
    }

    // Public creator profiles identify a CreatorProfile. Reviews remain owned by
    // the Creator's underlying User identity, so resolve that boundary here.
    const creator = await CreatorProfile.findOne({
      _id: creatorId,
      status: "active",
    })
      .select("userId")
      .lean();

    if (!creator) {
      return res.status(404).json({ message: "Creator not found" });
    }

    // ✅ Pagination params
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const skip = (page - 1) * limit;

    // ✅ TRUST FILTER APPLIED
    const query = {
      revieweeId: creator.userId,
      role: "USER_TO_CREATOR",
      trustScore: { $gte: 0.3 },
      isFlagged: { $ne: true },
    };

    // ✅ Total count
    const total = await Review.countDocuments(query);

    // ✅ Fetch paginated reviews
    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("_id reviewerId rating comment createdAt")
      .lean();

    const reviewerProfiles = await UserProfile.find({
      userId: { $in: reviews.map((review) => review.reviewerId) },
    })
      .select("userId username avatar")
      .lean();
    const profileByUserId = new Map(
      reviewerProfiles.map((profile) => [String(profile.userId), profile]),
    );

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      reviews: reviews.map((review) => {
        const reviewer = profileByUserId.get(String(review.reviewerId));
        return {
          reviewId: String(review._id),
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          reviewer: reviewer
            ? {
                displayName: reviewer.username,
                avatarUrl: reviewer.avatar,
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

  } catch (err) {
    console.error("GET REVIEWS ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch reviews",
    });
  }
};


/* =========================
   REPORT REVIEW (NEW)
========================= */

export const reportReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const { reviewId } = req.params;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!reviewId) {
      return res.status(400).json({
        message: "reviewId is required",
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    // ❌ Prevent self-report
    if (String(review.reviewerId) === user.id) {
      return res.status(400).json({
        message: "You cannot report your own review",
      });
    }

    // ✅ Increment reports
    review.reports = (review.reports || 0) + 1;

    // ✅ Auto moderation
    if (review.reports >= 3) {
      review.isFlagged = true;
    }

    await review.save();

    return res.status(200).json({
      message: "Review reported successfully",
    });

  } catch (err) {
    console.error("REPORT REVIEW ERROR:", err);

    return res.status(500).json({
      message: "Failed to report review",
    });
  }
};

/* =========================
   CURRENT ACTOR BOOKING REVIEW STATE
========================= */

export const getMyBookingReviewState = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  const booking = await Booking.findById(bookingId).select("userId creatorId").lean();
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const isParticipant =
    String(booking.userId) === user.id || String(booking.creatorId) === user.id;
  if (!isParticipant) {
    return res.status(403).json({ message: "Access denied" });
  }

  const review = await Review.findOne({ bookingId: booking._id, reviewerId: user.id })
    .select("_id rating comment reportFlag createdAt")
    .lean();

  return res.status(200).json({
    hasReviewed: Boolean(review),
    review: review
      ? {
          reviewId: String(review._id),
          rating: review.rating,
          comment: review.comment,
          reportFlag: review.reportFlag,
          createdAt: review.createdAt,
        }
      : null,
  });
};
