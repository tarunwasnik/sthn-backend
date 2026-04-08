"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//backend/src/routes/adminMode.routes.ts
const express_1 = require("express");
const adminMode_controller_1 = require("../controllers/adminMode.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
/**
 * GET /admin/mode
 * Returns current admin mode
 */
router.get("/mode", auth_middleware_1.protect, adminMode_controller_1.getAdminModeController);
/**
 * POST /admin/mode
 * Body: { mode: "SYSTEM" | "OPERATIONS" }
 */
router.post("/mode", auth_middleware_1.protect, adminMode_controller_1.setAdminModeController);
exports.default = router;
