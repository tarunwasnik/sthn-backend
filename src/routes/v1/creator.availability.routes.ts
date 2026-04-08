//backend/src/routes/v1/creator.availability.routes.ts


import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";

import {
  createAvailability,
  cancelAvailability,
  getCreatorAvailabilities,
  getAvailabilitySlots,
  disableSlot,
  enableSlot,
  deleteSlot
} from "../../controllers/creatorAvailability.controller";

const router = Router();

router.post(
  "/availability",
  protect,
  requireActiveCreator,
  createAvailability
);

router.get(
  "/availability",
  protect,
  requireActiveCreator,
  getCreatorAvailabilities
);

router.delete(
  "/availability/:availabilityId",
  protect,
  requireActiveCreator,
  cancelAvailability
);

router.get(
  "/availability/:availabilityId/slots",
  protect,
  requireActiveCreator,
  getAvailabilitySlots
);

router.patch(
  "/slots/:slotId/disable",
  protect,
  requireActiveCreator,
  disableSlot
);

router.patch(
  "/slots/:slotId/enable",
  protect,
  requireActiveCreator,
  enableSlot
);

router.delete(
  "/slots/:slotId",
  protect,
  requireActiveCreator,
  deleteSlot
);

export default router;