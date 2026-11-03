// backend/src/routes/v1/creatorBookingDecision.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";
import {
  decideBooking,
  getCreatorBookings,
  getCreatorPendingBookingRequestCount,
} from "../../controllers/creatorBookingDecision.controller";

const router = Router();

/**
 * Creator dashboard bookings
 */
router.get(
  "/bookings",
  protect,
  requireActiveCreator,
  getCreatorBookings
);

router.get(
  "/bookings/pending-count",
  protect,
  requireActiveCreator,
  getCreatorPendingBookingRequestCount
);

/**
 * Creator accepts or rejects booking
 */
router.post(
  "/bookings/:bookingId/decision",
  protect,
  requireActiveCreator,
  decideBooking
);

export default router;
