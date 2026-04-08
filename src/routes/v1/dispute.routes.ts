//backend/src/routes/v1/dispute.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  openDispute,
  getMyDisputes,
} from "../../controllers/dispute.controller";

const router = Router();

/**
 * Open a dispute
 * Body: { bookingId, reason }
 */
router.post(
  "/open",
  protect,
  openDispute
);

/**
 * Get my disputes (user or creator)
 */
router.get(
  "/my",
  protect,
  getMyDisputes
);

export default router;