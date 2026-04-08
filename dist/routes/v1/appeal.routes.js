"use strict";
//backend/src/routes/v1/appeal.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const appeal_controller_1 = require("../../controllers/appeal.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
/**
 * All appeal routes require authentication
 */
router.use(auth_middleware_1.protect);
/**
 * Raise an appeal against a dispute
 * POST /api/appeals/:disputeId
 */
router.post("/:disputeId", appeal_controller_1.raiseAppeal);
exports.default = router;
