"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//backend/src/routes/system.routes.ts
const express_1 = require("express");
const systemMode_middleware_1 = require("../middlewares/systemMode.middleware");
const systemBootstrap_controller_1 = require("../controllers/systemBootstrap.controller");
const router = (0, express_1.Router)();
/**
 * All SYSTEM dashboard routes:
 * - Authenticated
 * - Admin only
 * - SYSTEM mode enforced
 */
router.use(systemMode_middleware_1.systemModeOnly);
/**
 * Bootstrap endpoint
 * GET /admin/system/bootstrap
 */
router.get("/bootstrap", systemBootstrap_controller_1.systemBootstrapController);
exports.default = router;
