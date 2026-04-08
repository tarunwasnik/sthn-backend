"use strict";
// backend/src/routes/v1/creatorBookingDecision.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const creator_middleware_1 = require("../../middlewares/creator.middleware");
const creatorBookingDecision_controller_1 = require("../../controllers/creatorBookingDecision.controller");
const router = (0, express_1.Router)();
/**
 * Creator dashboard bookings
 */
router.get("/bookings", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorBookingDecision_controller_1.getCreatorBookings);
/**
 * Creator accepts or rejects booking
 */
router.post("/bookings/:bookingId/decision", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorBookingDecision_controller_1.decideBooking);
exports.default = router;
