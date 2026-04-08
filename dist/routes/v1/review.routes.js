"use strict";
//backend/src/routes/v1/review.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const review_controller_1 = require("../../controllers/review.controller");
const router = (0, express_1.Router)();
/* =========================
   SUBMIT REVIEW
========================= */
router.post("/:bookingId", auth_middleware_1.protect, review_controller_1.submitReview);
/* =========================
   GET CREATOR REVIEWS (PUBLIC)
========================= */
router.get("/creator/:creatorId", review_controller_1.getReviewsForCreator);
/* =========================
   REPORT REVIEW (NEW)
========================= */
router.post("/:reviewId/report", auth_middleware_1.protect, review_controller_1.reportReview);
exports.default = router;
