"use strict";
//backend/src/controllers/adminWallet/walletBackfill.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWalletBackfill = exports.previewWalletBackfill = void 0;
const userProfile_model_1 = require("../../models/userProfile.model");
const wallet_constants_1 = require("../../constants/wallet/wallet.constants");
const walletBackfill_service_1 = require("../../services/admin/walletBackfill.service");
/**
 * ============================================================
 * Wallet Backfill Preview
 * ============================================================
 */
const previewWalletBackfill = async (_req, res) => {
    const verifiedUsers = await userProfile_model_1.UserProfile.countDocuments({
        profileStatus: "verified",
    });
    const missingResult = await userProfile_model_1.UserProfile.aggregate([
        { $match: { profileStatus: "verified" } },
        {
            $lookup: {
                from: "wallets",
                let: { userId: "$userId" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$userId", "$$userId"] },
                            currency: wallet_constants_1.DEFAULT_WALLET_CURRENCY,
                        },
                    },
                    { $limit: 1 },
                ],
                as: "wallets",
            },
        },
        { $match: { "wallets.0": { $exists: false } } },
        { $count: "missingWallets" },
    ]);
    const missingWallets = missingResult[0]?.missingWallets ?? 0;
    const wallets = verifiedUsers - missingWallets;
    res.json({
        verifiedUsers,
        wallets,
        missingWallets,
    });
};
exports.previewWalletBackfill = previewWalletBackfill;
/**
 * ============================================================
 * Wallet Backfill Execution
 * ============================================================
 */
const executeWalletBackfill = async (_req, res) => {
    const result = await walletBackfill_service_1.walletBackfillService.backfillVerifiedUsers();
    res.status(200).json({
        success: true,
        message: "Wallet backfill completed successfully.",
        data: result,
    });
};
exports.executeWalletBackfill = executeWalletBackfill;
