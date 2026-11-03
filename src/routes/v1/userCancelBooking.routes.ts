//backend/src/routes/v1/userCancelBooking.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { captureCancellationReceipt } from "../../middlewares/cancellationReceipt.middleware";
import { cancelBookingByUser } from "../../controllers/userCancelBooking.controller";

const router = Router();

/* ✅ USER CANCEL */
router.post("/user/cancel", captureCancellationReceipt, protect, cancelBookingByUser);

export default router;
