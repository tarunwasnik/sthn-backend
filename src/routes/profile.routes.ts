// backend/src/routes/profile.routes.ts

import { Router } from "express";
import { protect } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import {
  upsertProfile,
  getMyProfile,
} from "../controllers/profile.controller";

const router = Router();

router.get("/me", protect, getMyProfile);

router.post(
  "/me",
  protect,
  upload.array("profilePhotos", 6), // 🔥 IMPORTANT
  upsertProfile
);

export default router;