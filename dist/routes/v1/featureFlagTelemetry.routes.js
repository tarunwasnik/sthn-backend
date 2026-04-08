"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const featureFlagTelemetry_controller_1 = require("../../controllers/featureFlagTelemetry.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const router = (0, express_1.Router)();
/**
 * GET /admin/feature-flag-events
 * Read-only telemetry
 */
router.get("/", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), featureFlagTelemetry_controller_1.getFeatureFlagEvents);
exports.default = router;
