"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controlPlaneFeatureFlags_controller_1 = require("../../controllers/controlPlaneFeatureFlags.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const router = (0, express_1.Router)();
/**
 * Control Plane — Feature Flags
 * Super-admin only
 */
router.get("/", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), controlPlaneFeatureFlags_controller_1.listFeatureFlags);
router.post("/", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), controlPlaneFeatureFlags_controller_1.createFeatureFlag);
router.patch("/:flagId", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), controlPlaneFeatureFlags_controller_1.updateFeatureFlag);
router.patch("/:flagId/toggle", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), controlPlaneFeatureFlags_controller_1.toggleFeatureFlag);
router.delete("/:flagId", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), controlPlaneFeatureFlags_controller_1.deleteFeatureFlag);
exports.default = router;
