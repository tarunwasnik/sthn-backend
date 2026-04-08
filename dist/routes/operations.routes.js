"use strict";
//backend/src/routes/operations.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const operationsMode_middleware_1 = require("../middlewares/operationsMode.middleware");
const operationsBootstrap_controller_1 = require("../controllers/operationsBootstrap.controller");
const router = (0, express_1.Router)();
/**
 * All OPERATIONS dashboard routes:
 * - Authenticated
 * - Admin only
 * - OPERATIONS mode enforced
 */
router.use(operationsMode_middleware_1.operationsModeOnly);
/**
 * Bootstrap endpoint
 * GET /admin/operations/bootstrap
 */
router.get("/bootstrap", operationsBootstrap_controller_1.operationsBootstrapController);
exports.default = router;
