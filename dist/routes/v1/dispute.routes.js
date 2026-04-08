"use strict";
//backend/src/routes/v1/dispute.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const dispute_controller_1 = require("../../controllers/dispute.controller");
const router = (0, express_1.Router)();
/**
 * Open a dispute
 * Body: { bookingId, reason }
 */
router.post("/open", auth_middleware_1.protect, dispute_controller_1.openDispute);
/**
 * Get my disputes (user or creator)
 */
router.get("/my", auth_middleware_1.protect, dispute_controller_1.getMyDisputes);
exports.default = router;
