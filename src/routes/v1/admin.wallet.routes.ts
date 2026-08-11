//backend/src/routes/v1/admin.wallet.routes.ts

import { Router } from "express";

import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

import {
  previewWalletBackfill,
  executeWalletBackfill,
} from "../../controllers/adminWallet/walletBackfill.controller";

const router = Router();

router.use(protect);
router.use(authorizeRoles("admin"));

router.get("/backfill/preview", previewWalletBackfill);

router.post("/backfill", executeWalletBackfill);

export default router;
