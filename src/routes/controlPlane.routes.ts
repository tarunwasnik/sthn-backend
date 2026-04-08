//backend/src/routes/controlPlane.routes.ts

import { Router } from "express";
import { ControlPlaneController } from "../controllers/controlPlane.controller";
import { validateCreateControl } from "../validations/controlPlane.validation";
import { protect } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";

import {
  getAdminModeController,
  setAdminModeController,
} from "../controllers/adminMode.controller";

const router = Router();

/**
 * All control plane APIs are:
 * - Authenticated
 * - Admin-only
 */
router.use(protect);
router.use(authorizeRoles("admin"));

/**
 * -------------------------
 * Control Plane Rules
 * -------------------------
 */

/**
 * List active control plane rules
 */
router.get("/", ControlPlaneController.listActiveControls);

/**
 * Create a new control plane rule
 */
router.post(
  "/",
  validateCreateControl,
  ControlPlaneController.createControl
);

/**
 * Deactivate a control plane rule
 */
router.post(
  "/:controlId/deactivate",
  ControlPlaneController.deactivateControl
);

/**
 * -------------------------
 * Admin Mode (Phase 31.2)
 * -------------------------
 * Endpoints:
 *  - GET  /control-plane/admin/mode
 *  - POST /control-plane/admin/mode
 */
router.get("/admin/mode", getAdminModeController);
router.post("/admin/mode", setAdminModeController);

export default router;