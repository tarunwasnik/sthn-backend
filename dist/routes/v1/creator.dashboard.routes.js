"use strict";
//backend/src/routes/v1/creator.dashboard.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const role_middleware_1 = require("../../middlewares/role.middleware");
const creatorDashboard_controller_1 = require("../../controllers/creatorDashboard.controller");
const router = (0, express_1.Router)();
/**
 * GET /api/v1/creator/dashboard
 */
router.get("/dashboard", auth_middleware_1.protect, (0, role_middleware_1.requireRole)("creator"), creatorDashboard_controller_1.getCreatorDashboard);
exports.default = router;
