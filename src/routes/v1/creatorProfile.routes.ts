//backend/src/routes/v1/creatorProfile.routes.ts

import { Router } from "express";
import {
  getMyCreatorProfile,
  updateMyCreatorProfile,
} from "../../controllers/creatorProfile.controller";

import { protect } from "../../middlewares/auth.middleware";
const router = Router();

router.get("/profile", protect, getMyCreatorProfile);
router.patch("/profile", protect, updateMyCreatorProfile);

export default router;