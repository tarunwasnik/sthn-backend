import { Router } from "express";
import {
  listFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  toggleFeatureFlag,
  deleteFeatureFlag,
} from "../../controllers/controlPlaneFeatureFlags.controller";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";
const router = Router();

/**
 * Control Plane — Feature Flags
 * Super-admin only
 */

router.get(
  "/",
  protect,
  authorizeRoles("admin"),
  listFeatureFlags
);

router.post(
  "/",
  protect,
    authorizeRoles("admin"),
  createFeatureFlag
);

router.patch(
  "/:flagId",
  protect,
   authorizeRoles("admin"),
  updateFeatureFlag
);

router.patch(
  "/:flagId/toggle",
  protect,
    authorizeRoles("admin"),
  toggleFeatureFlag
);

router.delete(
  "/:flagId",
  protect,
    authorizeRoles("admin"),
  deleteFeatureFlag
);

export default router;
