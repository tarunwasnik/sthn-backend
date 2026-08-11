import { Router } from "express";

import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";
import {
  createPayoutDestination,
  getPayoutDestination,
  listPayoutDestinations,
  setPayoutDestinationActivation,
} from "../../controllers/payoutDestination.controller";

const router = Router();

router.post("/payout-destinations", protect, requireActiveCreator, createPayoutDestination);
router.get("/payout-destinations", protect, requireActiveCreator, listPayoutDestinations);
router.get("/payout-destinations/:destinationReference", protect, requireActiveCreator, getPayoutDestination);
router.patch(
  "/payout-destinations/:destinationReference/activation",
  protect,
  requireActiveCreator,
  setPayoutDestinationActivation,
);

export default router;
