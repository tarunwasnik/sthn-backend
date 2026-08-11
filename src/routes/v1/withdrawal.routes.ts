import { Router } from "express";

import { withdrawalController } from "../../controllers/withdrawal.controller";
import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";

const router = Router();
router.get("/", protect, requireActiveCreator, withdrawalController.listWithdrawals.bind(withdrawalController));
router.get("/:withdrawalReference", protect, requireActiveCreator, withdrawalController.getWithdrawalByReference.bind(withdrawalController));

router.post(
  "/",
  protect,
  requireActiveCreator,
  withdrawalController.requestWithdrawal.bind(withdrawalController),
);

router.post("/:withdrawalId/cancel", protect, requireActiveCreator, withdrawalController.cancelWithdrawal.bind(withdrawalController));

router.post(
  "/:withdrawalId/refresh",
  protect,
  withdrawalController.refreshWithdrawalPayout.bind(withdrawalController),
);

export default router;
