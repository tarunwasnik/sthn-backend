"use strict";
// backend/src/controllers/review.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyBookingReviewState = exports.reportReview = exports.getReviewsForCreator = exports.submitReview = void 0;
const submitReview_service_1 = require("../services/review/submitReview.service");
const review_model_1 = require("../models/review.model");
const booking_model_1 = require("../models/booking.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const userProfile_model_1 = require("../models/userProfile.model");
const mongoose_1 = __importDefault(require("mongoose"));
/* =========================
   SUBMIT REVIEW
========================= */
const submitReview = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    const { rating, comment, reportFlag } = req.body;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const review = await (0, submitReview_service_1.submitReviewService)({
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
    }
    catch (err) {
        return res.status(400).json({
            message: err.message || "Failed to submit review",
        });
    }
};
exports.submitReview = submitReview;
/* =========================
   GET REVIEWS FOR CREATOR (PAGINATED + TRUST FILTER)
========================= */
const getReviewsForCreator = async (req, res) => {
    try {
        const { creatorId } = req.params;
        if (!creatorId || !mongoose_1.default.Types.ObjectId.isValid(creatorId)) {
            return res.status(400).json({
                message: "Invalid creatorId",
            });
        }
        // Public creator profiles identify a CreatorProfile. Reviews remain owned by
        // the Creator's underlying User identity, so resolve that boundary here.
        const creator = await creatorProfile_model_1.CreatorProfile.findOne({
            _id: creatorId,
            status: "active",
        })
            .select("userId")
            .lean();
        if (!creator) {
            return res.status(404).json({ message: "Creator not found" });
        }
        // ✅ Pagination params
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const skip = (page - 1) * limit;
        // ✅ TRUST FILTER APPLIED
        const query = {
            revieweeId: creator.userId,
            role: "USER_TO_CREATOR",
            trustScore: { $gte: 0.3 },
            isFlagged: { $ne: true },
        };
        // ✅ Total count
        const total = await review_model_1.Review.countDocuments(query);
        // ✅ Fetch paginated reviews
        const reviews = await review_model_1.Review.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("_id reviewerId rating comment createdAt")
            .lean();
        const reviewerProfiles = await userProfile_model_1.UserProfile.find({
            userId: { $in: reviews.map((review) => review.reviewerId) },
        })
            .select("userId username avatar")
            .lean();
        const profileByUserId = new Map(reviewerProfiles.map((profile) => [String(profile.userId), profile]));
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
    }
    catch (err) {
        console.error("GET REVIEWS ERROR:", err);
        return res.status(500).json({
            message: "Failed to fetch reviews",
        });
    }
};
exports.getReviewsForCreator = getReviewsForCreator;
/* =========================
   REPORT REVIEW (NEW)
========================= */
const reportReview = async (req, res) => {
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
        const review = await review_model_1.Review.findById(reviewId);
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
    }
    catch (err) {
        console.error("REPORT REVIEW ERROR:", err);
        return res.status(500).json({
            message: "Failed to report review",
        });
    }
};
exports.reportReview = reportReview;
/* =========================
   CURRENT ACTOR BOOKING REVIEW STATE
========================= */
const getMyBookingReviewState = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    const booking = await booking_model_1.Booking.findById(bookingId).select("userId creatorId").lean();
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const isParticipant = String(booking.userId) === user.id || String(booking.creatorId) === user.id;
    if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
    }
    const review = await review_model_1.Review.findOne({ bookingId: booking._id, reviewerId: user.id })
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
exports.getMyBookingReviewState = getMyBookingReviewState;
