"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const featureFlagDashboard_controller_1 = require("../../controllers/featureFlagDashboard.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const router = (0, express_1.Router)();
/**
 * GET /admin/system/feature-flags
 * Dashboard summary for feature flag health
 */
router.get("/", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), featureFlagDashboard_controller_1.getFeatureFlagDashboard);
exports.default = router;
