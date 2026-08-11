// backend/src/routes/v1/wallet.routes.ts

import { Router } from "express";

import { protect } from "../../middlewares/auth.middleware";
import { walletController } from "../../controllers/wallet.controller";
import { walletTopUpRequestController } from "../../controllers/walletTopUpRequest.controller";
import { fxRateSnapshotController } from
  "../../controllers/fxRateSnapshot.controller";
import { walletConversionRequestController } from
  "../../controllers/walletConversionRequest.controller";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Routes
 * ============================================================
 *
 * Responsibility
 * --------------
 * Registers Wallet APIs.
 *
 * All routes require authentication.
 * ============================================================
 */

const router = Router();

router.post("/conversion-requests", protect,
  walletConversionRequestController.create.bind(walletConversionRequestController));
router.get("/conversion-requests", protect,
  walletConversionRequestController.list.bind(walletConversionRequestController));
router.get("/conversion-requests/:conversionReference", protect,
  walletConversionRequestController.get.bind(walletConversionRequestController));

router.get(
  "/fx-rates/:baseCurrency/:quoteCurrency",
  protect,
  fxRateSnapshotController.current.bind(fxRateSnapshotController),
);

router.get(
  "/currencies",
  protect,
  walletController.listCurrencies.bind(walletController),
);

router.get(
  "/all",
  protect,
  walletController.listWallets.bind(walletController),
);

/**
 * Wallet Projection
 */
router.get("/", protect, walletController.getWallet.bind(walletController));

/**
 * Wallet Balance
 */
router.get(
  "/balance",
  protect,
  walletController.getBalance.bind(walletController),
);
router.post("/top-up-requests", protect, walletTopUpRequestController.create.bind(walletTopUpRequestController));
router.get("/top-up-requests", protect, walletTopUpRequestController.list.bind(walletTopUpRequestController));
router.get("/top-up-requests/:topUpReference", protect, walletTopUpRequestController.get.bind(walletTopUpRequestController));

/**
 * Wallet Summary
 */
router.get(
  "/summary",
  protect,
  walletController.getSummary.bind(walletController),
);

export default router;
