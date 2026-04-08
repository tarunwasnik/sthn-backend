"use strict";
//backend/src/services/review/submitReview.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitReviewService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const review_model_1 = require("../../models/review.model");
const booking_model_1 = require("../../models/booking.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const submitReviewService = async ({ bookingId, reviewerId, rating, comment, reportFlag, }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        throw new Error("Invalid bookingId");
    }
    if (rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5");
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const booking = await booking_model_1.Booking.findById(bookingId).session(session);
        if (!booking) {
            throw new Error("Booking not found");
        }
        if (booking.status !== "COMPLETED") {
            throw new Error("Reviews allowed only after completion");
        }
        let revieweeId;
        let role;
        if (String(booking.userId) === reviewerId) {
            revieweeId = String(booking.creatorId);
            role = "USER_TO_CREATOR";
        }
        else if (String(booking.creatorId) === reviewerId) {
            revieweeId = String(booking.userId);
            role = "CREATOR_TO_USER";
        }
        else {
            throw new Error("You are not part of this booking");
        }
        const existingReview = await review_model_1.Review.findOne({
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
        const review = await review_model_1.Review.create([
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
        ], { session });
        /* =========================
           🔥 WEIGHTED RATING UPDATE
        ========================= */
        if (role === "USER_TO_CREATOR") {
            const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
                userId: revieweeId,
            }).session(session);
            if (creatorProfile) {
                // ✅ Fetch all valid reviews (trusted only)
                const reviews = await review_model_1.Review.find({
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
                const newRating = totalWeight > 0 ? weightedSum / totalWeight : rating;
                creatorProfile.rating = newRating;
                creatorProfile.reviewCount = reviews.length;
                await creatorProfile.save({ session });
            }
        }
        await session.commitTransaction();
        session.endSession();
        return review[0];
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};
exports.submitReviewService = submitReviewService;
