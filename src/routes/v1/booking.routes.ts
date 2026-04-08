// backend/src/routes/v1/booking.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";

import {
  requestBooking,
  refundBooking,
  getUserBookings, // ✅ NEW
} from "../../controllers/booking.controller";

import { cancelBookingByUser } from "../../controllers/userCancelBooking.controller";

import { markBookingInteracted } from "../../controllers/bookingInteraction.controller";

import {
  completeBookingByCreator,
  completeBookingByUser,
} from "../../controllers/completeBooking.controller";

const router = Router();

/* =========================================================
   USER BOOKINGS (NEW)
========================================================= */

router.get("/user", protect, getUserBookings);

/* =========================================================
   BOOKING REQUEST
========================================================= */

router.post("/request", protect, requestBooking);

/* =========================================================
   BOOKING INTERACTION
========================================================= */

router.post("/:bookingId/interact", protect, markBookingInteracted);

/* =========================================================
   BOOKING COMPLETION
========================================================= */

router.post(
  "/:bookingId/complete/creator",
  protect,
  completeBookingByCreator
);

router.post(
  "/:bookingId/complete/user",
  protect,
  completeBookingByUser
);

/* =========================================================
   BOOKING CANCELLATION
========================================================= */

router.post("/:bookingId/cancel", protect, cancelBookingByUser);

/* =========================================================
   REFUND LIFECYCLE
========================================================= */

router.post("/:bookingId/refund", protect, refundBooking);

export default router;