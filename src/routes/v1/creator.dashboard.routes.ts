//backend/src/routes/v1/creator.dashboard.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { getCreatorDashboard } from "../../controllers/creatorDashboard.controller";

const router = Router();

/**
 * GET /api/v1/creator/dashboard
 */
router.get(
  "/dashboard",
  protect,
  requireRole("creator"),
  getCreatorDashboard
);

export default router;