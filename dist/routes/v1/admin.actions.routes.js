"use strict";
//backend/src/routes/v1/admin.actions.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const adminActionRegistry_controller_1 = require("../../controllers/adminActions/adminActionRegistry.controller");
const applyCreatorCooldown_controller_1 = require("../../controllers/adminActions/applyCreatorCooldown.controller");
const revokeCreatorCooldown_controller_1 = require("../../controllers/adminActions/revokeCreatorCooldown.controller");
const adminActionDispatcher_controller_1 = require("../../controllers/adminActions/adminActionDispatcher.controller");
const adminActionLogs_controller_1 = require("../../controllers/adminActions/adminActionLogs.controller");
// Phase 30 – Admin Control Plane UX
const adminControls_controller_1 = require("../../controllers/adminActions/adminControls.controller");
const router = (0, express_1.Router)();
/* ================= ADMIN ACTIONS ================= */
// Action registry (Phase 20.1)
router.get("/registry", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminActionRegistry_controller_1.listAdminActions);
// Existing actions
router.post("/apply-cooldown", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), applyCreatorCooldown_controller_1.applyCreatorCooldown);
router.post("/revoke-cooldown", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), revokeCreatorCooldown_controller_1.revokeCreatorCooldown);
router.post("/execute", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminActionDispatcher_controller_1.executeAdminAction);
router.get("/logs", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminActionLogs_controller_1.getAdminActionLogs);
/* ================= CONTROL PLANE (PHASE 30 UX) ================= */
router.get("/controls/active", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminControls_controller_1.getActiveControls);
router.get("/controls/history", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminControls_controller_1.getControlHistory);
router.get("/controls/:id", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminControls_controller_1.getControlById);
router.post("/controls", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminControls_controller_1.createControl);
router.post("/controls/:id/expire", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminControls_controller_1.expireControl);
exports.default = router;
