"use strict";
//backend/src/routes/v1/userCancelBooking.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const userCancelBooking_controller_1 = require("../../controllers/userCancelBooking.controller");
const router = (0, express_1.Router)();
/* ✅ USER CANCEL */
router.post("/user/cancel", auth_middleware_1.protect, userCancelBooking_controller_1.cancelBookingByUser);
exports.default = router;
