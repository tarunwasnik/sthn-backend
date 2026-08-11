"use strict";
// backend/src/routes/system.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const authorize_middleware_1 = require("../middlewares/authorize.middleware");
const systemMode_middleware_1 = require("../middlewares/systemMode.middleware");
const systemBootstrap_controller_1 = require("../controllers/systemBootstrap.controller");
const router = (0, express_1.Router)();
/**
 * All SYSTEM dashboard routes:
 * - Authenticated
 * - Admin only
 * - SYSTEM mode enforced
 */
// Authentication
router.use(auth_middleware_1.protect);
// Admin authorization
router.use((0, authorize_middleware_1.authorizeRoles)("admin"));
// System mode enforcement
router.use(systemMode_middleware_1.systemModeOnly);
/**
 * Bootstrap endpoint
 * GET /admin/system/bootstrap
 */
router.get("/bootstrap", systemBootstrap_controller_1.systemBootstrapController);
exports.default = router;
