"use strict";
//backend/src/routes/operations.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const authorize_middleware_1 = require("../middlewares/authorize.middleware");
const operationsMode_middleware_1 = require("../middlewares/operationsMode.middleware");
const operationsBootstrap_controller_1 = require("../controllers/operationsBootstrap.controller");
const router = (0, express_1.Router)();
/* Authentication */
router.use(auth_middleware_1.protect);
/* Admin only */
router.use((0, authorize_middleware_1.authorizeRoles)("admin"));
/* Operations mode */
router.use(operationsMode_middleware_1.operationsModeOnly);
/* Bootstrap */
router.get("/bootstrap", operationsBootstrap_controller_1.operationsBootstrapController);
exports.default = router;
