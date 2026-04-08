// backend/src/routes/v1/user.routes.ts

console.log("🔥 user.routes.ts loaded");

import { Router } from "express";
import { getUsers, getUserPublicProfile } from "../../controllers/user.controller";
import { protect } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { ROLES } from "../../constants/roles";
import { getAvailableSlotsForCreator } from "../../controllers/creatorAvailability.controller";

const router = Router();

/* =========================================================
   ✅ PUBLIC USER PROFILE (NEW)
========================================================= */

router.get("/:userId", getUserPublicProfile);

/* =========================================================
   CREATOR SLOTS
========================================================= */

router.get(
  "/creators/:creatorId/slots",
  getAvailableSlotsForCreator
);

/* =========================================================
   ADMIN USERS
========================================================= */

router.get(
  "/",
  protect,
  requireRole(ROLES.ADMIN),
  getUsers
);

export default router;