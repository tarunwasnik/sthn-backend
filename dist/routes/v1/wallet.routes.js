"use strict";
// backend/src/routes/v1/wallet.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const wallet_controller_1 = require("../../controllers/wallet.controller");
const walletTopUpRequest_controller_1 = require("../../controllers/walletTopUpRequest.controller");
const fxRateSnapshot_controller_1 = require("../../controllers/fxRateSnapshot.controller");
const walletConversionRequest_controller_1 = require("../../controllers/walletConversionRequest.controller");
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
const router = (0, express_1.Router)();
router.post("/conversion-requests", auth_middleware_1.protect, walletConversionRequest_controller_1.walletConversionRequestController.create.bind(walletConversionRequest_controller_1.walletConversionRequestController));
router.get("/conversion-requests", auth_middleware_1.protect, walletConversionRequest_controller_1.walletConversionRequestController.list.bind(walletConversionRequest_controller_1.walletConversionRequestController));
router.get("/conversion-requests/:conversionReference", auth_middleware_1.protect, walletConversionRequest_controller_1.walletConversionRequestController.get.bind(walletConversionRequest_controller_1.walletConversionRequestController));
router.get("/fx-rates/:baseCurrency/:quoteCurrency", auth_middleware_1.protect, fxRateSnapshot_controller_1.fxRateSnapshotController.current.bind(fxRateSnapshot_controller_1.fxRateSnapshotController));
router.get("/currencies", auth_middleware_1.protect, wallet_controller_1.walletController.listCurrencies.bind(wallet_controller_1.walletController));
router.get("/all", auth_middleware_1.protect, wallet_controller_1.walletController.listWallets.bind(wallet_controller_1.walletController));
/**
 * Wallet Projection
 */
router.get("/", auth_middleware_1.protect, wallet_controller_1.walletController.getWallet.bind(wallet_controller_1.walletController));
/**
 * Wallet Balance
 */
router.get("/balance", auth_middleware_1.protect, wallet_controller_1.walletController.getBalance.bind(wallet_controller_1.walletController));
router.post("/top-up-requests", auth_middleware_1.protect, walletTopUpRequest_controller_1.walletTopUpRequestController.create.bind(walletTopUpRequest_controller_1.walletTopUpRequestController));
router.get("/top-up-requests", auth_middleware_1.protect, walletTopUpRequest_controller_1.walletTopUpRequestController.list.bind(walletTopUpRequest_controller_1.walletTopUpRequestController));
router.get("/top-up-requests/:topUpReference", auth_middleware_1.protect, walletTopUpRequest_controller_1.walletTopUpRequestController.get.bind(walletTopUpRequest_controller_1.walletTopUpRequestController));
/**
 * Wallet Summary
 */
router.get("/summary", auth_middleware_1.protect, wallet_controller_1.walletController.getSummary.bind(wallet_controller_1.walletController));
exports.default = router;
