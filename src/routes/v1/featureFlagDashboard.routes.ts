import { Router } from "express";
import { getFeatureFlagDashboard } from "../../controllers/featureFlagDashboard.controller";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

const router = Router();

/**
 * GET /admin/system/feature-flags
 * Dashboard summary for feature flag health
 */
router.get(
  "/",
  protect,
  authorizeRoles("admin"),
  getFeatureFlagDashboard
);

export default router;