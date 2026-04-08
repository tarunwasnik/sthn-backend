"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//backend/src/routes/v1/profileVerification.routes.ts
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const profileVerification_controller_1 = require("../../controllers/profileVerification.controller");
const router = (0, express_1.Router)();
router.get("/pending", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), profileVerification_controller_1.listPendingProfiles);
router.patch("/:profileId/approve", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), profileVerification_controller_1.approveProfile);
router.patch("/:profileId/reject", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), profileVerification_controller_1.rejectProfile);
exports.default = router;
