"use strict";
// backend/src/controllers/review.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportReview = exports.getReviewsForCreator = exports.submitReview = void 0;
const submitReview_service_1 = require("../services/review/submitReview.service");
const review_model_1 = require("../models/review.model");
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
        if (!creatorId) {
            return res.status(400).json({
                message: "creatorId is required",
            });
        }
        // ✅ Pagination params
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const skip = (page - 1) * limit;
        // ✅ TRUST FILTER APPLIED
        const query = {
            revieweeId: creatorId,
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
            .populate("reviewerId", "displayName avatarUrl");
        const totalPages = Math.ceil(total / limit);
        return res.status(200).json({
            reviews,
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
