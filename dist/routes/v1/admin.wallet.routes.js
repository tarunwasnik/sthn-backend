"use strict";
//backend/src/routes/v1/admin.wallet.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const walletBackfill_controller_1 = require("../../controllers/adminWallet/walletBackfill.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.protect);
router.use((0, authorize_middleware_1.authorizeRoles)("admin"));
router.get("/backfill/preview", walletBackfill_controller_1.previewWalletBackfill);
router.post("/backfill", walletBackfill_controller_1.executeWalletBackfill);
exports.default = router;
