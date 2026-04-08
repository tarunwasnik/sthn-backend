"use strict";
// backend/src/routes/v1/booking.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const booking_controller_1 = require("../../controllers/booking.controller");
const userCancelBooking_controller_1 = require("../../controllers/userCancelBooking.controller");
const bookingInteraction_controller_1 = require("../../controllers/bookingInteraction.controller");
const completeBooking_controller_1 = require("../../controllers/completeBooking.controller");
const router = (0, express_1.Router)();
/* =========================================================
   USER BOOKINGS (NEW)
========================================================= */
router.get("/user", auth_middleware_1.protect, booking_controller_1.getUserBookings);
/* =========================================================
   BOOKING REQUEST
========================================================= */
router.post("/request", auth_middleware_1.protect, booking_controller_1.requestBooking);
/* =========================================================
   BOOKING INTERACTION
========================================================= */
router.post("/:bookingId/interact", auth_middleware_1.protect, bookingInteraction_controller_1.markBookingInteracted);
/* =========================================================
   BOOKING COMPLETION
========================================================= */
router.post("/:bookingId/complete/creator", auth_middleware_1.protect, completeBooking_controller_1.completeBookingByCreator);
router.post("/:bookingId/complete/user", auth_middleware_1.protect, completeBooking_controller_1.completeBookingByUser);
/* =========================================================
   BOOKING CANCELLATION
========================================================= */
router.post("/:bookingId/cancel", auth_middleware_1.protect, userCancelBooking_controller_1.cancelBookingByUser);
/* =========================================================
   REFUND LIFECYCLE
========================================================= */
router.post("/:bookingId/refund", auth_middleware_1.protect, booking_controller_1.refundBooking);
exports.default = router;
