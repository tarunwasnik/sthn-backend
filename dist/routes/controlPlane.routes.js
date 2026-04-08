"use strict";
//backend/src/routes/controlPlane.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controlPlane_controller_1 = require("../controllers/controlPlane.controller");
const controlPlane_validation_1 = require("../validations/controlPlane.validation");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const authorize_middleware_1 = require("../middlewares/authorize.middleware");
const adminMode_controller_1 = require("../controllers/adminMode.controller");
const router = (0, express_1.Router)();
/**
 * All control plane APIs are:
 * - Authenticated
 * - Admin-only
 */
router.use(auth_middleware_1.protect);
router.use((0, authorize_middleware_1.authorizeRoles)("admin"));
/**
 * -------------------------
 * Control Plane Rules
 * -------------------------
 */
/**
 * List active control plane rules
 */
router.get("/", controlPlane_controller_1.ControlPlaneController.listActiveControls);
/**
 * Create a new control plane rule
 */
router.post("/", controlPlane_validation_1.validateCreateControl, controlPlane_controller_1.ControlPlaneController.createControl);
/**
 * Deactivate a control plane rule
 */
router.post("/:controlId/deactivate", controlPlane_controller_1.ControlPlaneController.deactivateControl);
/**
 * -------------------------
 * Admin Mode (Phase 31.2)
 * -------------------------
 * Endpoints:
 *  - GET  /control-plane/admin/mode
 *  - POST /control-plane/admin/mode
 */
router.get("/admin/mode", adminMode_controller_1.getAdminModeController);
router.post("/admin/mode", adminMode_controller_1.setAdminModeController);
exports.default = router;
