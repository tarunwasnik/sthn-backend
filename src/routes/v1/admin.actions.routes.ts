//backend/src/routes/v1/admin.actions.routes.ts



import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

import { listAdminActions } from "../../controllers/adminActions/adminActionRegistry.controller";
import { applyCreatorCooldown } from "../../controllers/adminActions/applyCreatorCooldown.controller";
import { revokeCreatorCooldown } from "../../controllers/adminActions/revokeCreatorCooldown.controller";
import { executeAdminAction } from "../../controllers/adminActions/adminActionDispatcher.controller";
import { getAdminActionLogs } from "../../controllers/adminActions/adminActionLogs.controller";

// Phase 30 – Admin Control Plane UX
import {
  getActiveControls,
  getControlHistory,
  getControlById,
  createControl,
  expireControl,
} from "../../controllers/adminActions/adminControls.controller";

const router = Router();

/* ================= ADMIN ACTIONS ================= */

// Action registry (Phase 20.1)
router.get(
  "/registry",
  protect,
  authorizeRoles("admin"),
  listAdminActions
);

// Existing actions
router.post(
  "/apply-cooldown",
  protect,
  authorizeRoles("admin"),
  applyCreatorCooldown
);

router.post(
  "/revoke-cooldown",
  protect,
  authorizeRoles("admin"),
  revokeCreatorCooldown
);

router.post(
  "/execute",
  protect,
  authorizeRoles("admin"),
  executeAdminAction
);

router.get(
  "/logs",
  protect,
  authorizeRoles("admin"),
  getAdminActionLogs
);

/* ================= CONTROL PLANE (PHASE 30 UX) ================= */

router.get(
  "/controls/active",
  protect,
  authorizeRoles("admin"),
  getActiveControls
);

router.get(
  "/controls/history",
  protect,
  authorizeRoles("admin"),
  getControlHistory
);

router.get(
  "/controls/:id",
  protect,
  authorizeRoles("admin"),
  getControlById
);

router.post(
  "/controls",
  protect,
  authorizeRoles("admin"),
  createControl
);

router.post(
  "/controls/:id/expire",
  protect,
  authorizeRoles("admin"),
  expireControl
);

export default router;