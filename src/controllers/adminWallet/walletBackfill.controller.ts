//backend/src/controllers/adminWallet/walletBackfill.controller.ts

import { Request, Response } from "express";

import { UserProfile } from "../../models/userProfile.model";
import { DEFAULT_WALLET_CURRENCY } from "../../constants/wallet/wallet.constants";
import { walletBackfillService } from "../../services/admin/walletBackfill.service";

/**
 * ============================================================
 * Wallet Backfill Preview
 * ============================================================
 */
export const previewWalletBackfill = async (_req: Request, res: Response) => {
  const verifiedUsers = await UserProfile.countDocuments({
    profileStatus: "verified",
  });

  const missingResult = await UserProfile.aggregate<{ missingWallets: number }>([
    { $match: { profileStatus: "verified" } },
    {
      $lookup: {
        from: "wallets",
        let: { userId: "$userId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
              currency: DEFAULT_WALLET_CURRENCY,
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

/**
 * ============================================================
 * Wallet Backfill Execution
 * ============================================================
 */
export const executeWalletBackfill = async (_req: Request, res: Response) => {
  const result = await walletBackfillService.backfillVerifiedUsers();

  res.status(200).json({
    success: true,
    message: "Wallet backfill completed successfully.",
    data: result,
  });
};
