//backend/src/routes/v1/review.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  submitReview,
  getReviewsForCreator,
  reportReview, // ✅ NEW
} from "../../controllers/review.controller";

const router = Router();

/* =========================
   SUBMIT REVIEW
========================= */
router.post("/:bookingId", protect, submitReview);

/* =========================
   GET CREATOR REVIEWS (PUBLIC)
========================= */
router.get("/creator/:creatorId", getReviewsForCreator);

/* =========================
   REPORT REVIEW (NEW)
========================= */
router.post("/:reviewId/report", protect, reportReview);

export default router;