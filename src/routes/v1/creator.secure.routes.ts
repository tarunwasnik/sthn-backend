//backend/src/routes/v1/creator.secure.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";

import {
  createCreatorService,
  getMyServices,
  updateCreatorService,
  deleteCreatorService,
} from "../../controllers/creatorService.controller";

import { getCreatorBookingDetails } from "../../controllers/creatorBookingDetails.controller";

const router = Router();

/**
 * Test creator-only access
 */
router.get(
  "/me",
  protect,
  requireActiveCreator,
  (req, res) => {
    res.json({
      message: "Creator access granted",
      creatorProfile: (req as any).creatorProfile,
    });
  }
);

/* ================= SERVICES (CREATOR DASHBOARD) ================= */

/**
 * Create service
 */
router.post(
  "/services",
  protect,
  requireActiveCreator,
  createCreatorService
);

/**
 * List my services
 */
router.get(
  "/services",
  protect,
  requireActiveCreator,
  getMyServices
);

/**
 * Update service
 */
router.patch(
  "/services/:serviceId",
  protect,
  requireActiveCreator,
  updateCreatorService
);

/**
 * Soft delete service
 */
router.delete(
  "/services/:serviceId",
  protect,
  requireActiveCreator,
  deleteCreatorService
);


router.get(
  "/bookings/:id",
  protect,
  getCreatorBookingDetails
);
export default router;