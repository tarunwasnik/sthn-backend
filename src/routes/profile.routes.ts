// backend/src/routes/profile.routes.ts

import { Router } from "express";

import { protect } from "../middlewares/auth.middleware";
import {
  upsertProfile,
  getMyProfile,
  saveMyOnboardingDraft,
  updateMyProfile,
} from "../controllers/profile.controller";

const router = Router();

/* ================= GET PROFILE ================= */

router.get("/me", protect, getMyProfile);
router.put("/me/draft", protect, saveMyOnboardingDraft);

/* ================= CREATE PROFILE ================= */
/**
 * First-time profile creation
 * Expects JSON (NOT FormData anymore)
 */
router.post("/me", protect, upsertProfile);

/* ================= UPDATE PROFILE ================= */
/**
 * Editing profile (frontend already uploads to Cloudinary)
 */
router.patch("/me", protect, updateMyProfile);

export default router;
