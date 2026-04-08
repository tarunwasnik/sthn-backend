//backend/src/routes/v1/creatorCancelBooking.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { ROLES } from "../../constants/roles";
import { cancelBookingByCreator } from "../../controllers/creatorCancelBooking.controller";

const router = Router();

router.post(
  "/cancel-booking",
  protect,
  requireRole(ROLES.CREATOR),
  cancelBookingByCreator
);

export default router;