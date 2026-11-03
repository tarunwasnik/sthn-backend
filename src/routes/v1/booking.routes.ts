// backend/src/routes/v1/booking.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { captureCancellationReceipt } from "../../middlewares/cancellationReceipt.middleware";

import {
  requestBooking,
  refundBooking,
  getUserBookings,
  checkCreatorJourneyEligibility,
} from "../../controllers/booking.controller";
import {
  getBookingFunding,
  previewBookingFunding,
} from "../../controllers/bookingFunding.controller";

import { cancelBookingByUser } from "../../controllers/userCancelBooking.controller";
import { getCustomerBookingDetails } from "../../controllers/customerBookingDetails.controller";

import { markBookingInteracted } from "../../controllers/bookingInteraction.controller";
import { confirmRazorpaySandboxPayment } from "../../controllers/razorpaySandboxConfirmation.controller";

import {
  completeBookingByCreator,
  completeBookingByUser,
} from "../../controllers/completeBooking.controller";

const router = Router();

/* =========================================================
   USER BOOKINGS
========================================================= */

router.get("/user", protect, getUserBookings);

/* =========================================================
   SAFE BOOKING FINANCIAL READS
========================================================= */
router.post("/pricing-preview", protect, previewBookingFunding);
router.get("/:bookingId/funding", protect, getBookingFunding);
router.get("/:bookingId", protect, getCustomerBookingDetails);
router.post("/:bookingId/razorpay-sandbox-confirm", protect, confirmRazorpaySandboxPayment);

/* =========================================================
   CREATOR JOURNEY ELIGIBILITY
========================================================= */

router.get(
  "/creator-journey-eligibility",
  protect,
  checkCreatorJourneyEligibility,
);

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

router.post("/:bookingId/complete/creator", protect, completeBookingByCreator);

router.post("/:bookingId/complete/user", protect, completeBookingByUser);

/* =========================================================
   BOOKING CANCELLATION
========================================================= */

router.post("/:bookingId/cancel", captureCancellationReceipt, protect, cancelBookingByUser);

/* =========================================================
   REFUND LIFECYCLE
========================================================= */

router.post("/:bookingId/refund", protect, refundBooking);

export default router;
