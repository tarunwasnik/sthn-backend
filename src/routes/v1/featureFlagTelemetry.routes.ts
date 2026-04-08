import { Router } from "express";
import { getFeatureFlagEvents } from "../../controllers/featureFlagTelemetry.controller";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

const router = Router();

/**
 * GET /admin/feature-flag-events
 * Read-only telemetry
 */
router.get(
  "/",
  protect,
  authorizeRoles("admin"),
  getFeatureFlagEvents
);

export default router;