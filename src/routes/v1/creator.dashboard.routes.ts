//backend/src/routes/v1/creator.dashboard.routes.ts

import { Router } from "express";
import { protect, protectRestrictedRead } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { getCreatorDashboard } from "../../controllers/creatorDashboard.controller";
import { getCreatorEntitlements, getCreatorSelfStatus } from "../../controllers/creatorFinancialRead.controller";

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
router.get("/self-status", protectRestrictedRead, requireRole("creator"), getCreatorSelfStatus);
router.get("/entitlements", protectRestrictedRead, requireRole("creator"), getCreatorEntitlements);

export default router;
