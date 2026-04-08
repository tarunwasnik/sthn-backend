//backend/src/routes/v1/userCancelBooking.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { cancelBookingByUser } from "../../controllers/userCancelBooking.controller";

const router = Router();

/* ✅ USER CANCEL */
router.post("/user/cancel", protect, cancelBookingByUser);

export default router;