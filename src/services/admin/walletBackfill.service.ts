//backend/src/services/admin/walletBackfill.service.ts

import { Types } from "mongoose";
import { DEFAULT_WALLET_CURRENCY } from
  "../../constants/wallet/wallet.constants";

import { UserProfile } from "../../models/userProfile.model";
import { walletCreationService } from "../wallet/walletCreation.service";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Backfill Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Creates Wallet projections for verified users that
 * predate the Wallet Domain.
 *
 * This service is intended for operational/admin use.
 *
 * Business Rules
 * --------------
 * - One User -> One Wallet.
 * - Wallet creation is delegated to WalletCreationService.
 * - Existing wallets are never modified.
 * - No ledger operations.
 * - No financial events.
 * - No balance mutations.
 * ============================================================
 */

export interface WalletBackfillResult {
  startedAt: Date;
  completedAt: Date;

  scanned: number;
  created: number;
  skipped: number;
  failed: number;

  failedUserIds: string[];
}

export class WalletBackfillService {
  /**
   * Backfill wallets for every verified user.
   */
  async backfillVerifiedUsers(): Promise<WalletBackfillResult> {
    const startedAt = new Date();

    const verifiedProfiles = await UserProfile.find({
      profileStatus: "verified",
    })
      .select("userId")
      .sort({
        createdAt: 1,
      })
      .lean();

    const result: WalletBackfillResult = {
      startedAt,
      completedAt: startedAt,

      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,

      failedUserIds: [],
    };

    console.info(
      `[WalletBackfill] Starting wallet backfill for ${verifiedProfiles.length} verified users.`,
    );

    for (let index = 0; index < verifiedProfiles.length; index++) {
      const profile = verifiedProfiles[index];

      result.scanned++;

      console.info(
        `[WalletBackfill] Processing ${index + 1}/${verifiedProfiles.length}`,
      );

      if (!profile.userId) {
        result.failed++;
        result.failedUserIds.push("UNKNOWN");

        console.error("[WalletBackfill] Profile is missing a valid userId.");

        continue;
      }

      try {
        const existingWallet = await walletCreationService.getWallet(
          profile.userId as Types.ObjectId,
          DEFAULT_WALLET_CURRENCY,
        );

        if (existingWallet) {
          result.skipped++;
          continue;
        }

        await walletCreationService.createWallet(
          profile.userId as Types.ObjectId,
          DEFAULT_WALLET_CURRENCY,
        );

        result.created++;
      } catch (error) {
        result.failed++;

        result.failedUserIds.push(profile.userId.toString());

        console.error(
          `[WalletBackfill] Failed for user ${profile.userId.toString()}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    result.completedAt = new Date();

    console.info("[WalletBackfill] Completed.", {
      scanned: result.scanned,
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }

  /**
   * Retry wallet creation for a specific list of users.
   */
  async backfillUsers(
    userIds: Types.ObjectId[],
  ): Promise<WalletBackfillResult> {
    const startedAt = new Date();

    const verifiedProfiles = await UserProfile.find({
      userId: {
        $in: userIds,
      },
      profileStatus: "verified",
    })
      .select("userId")
      .sort({
        createdAt: 1,
      })
      .lean();

    const result: WalletBackfillResult = {
      startedAt,
      completedAt: startedAt,

      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,

      failedUserIds: [],
    };

    for (const profile of verifiedProfiles) {
      result.scanned++;

      if (!profile.userId) {
        result.failed++;
        result.failedUserIds.push("UNKNOWN");
        continue;
      }

      try {
        const existingWallet = await walletCreationService.getWallet(
          profile.userId as Types.ObjectId,
          DEFAULT_WALLET_CURRENCY,
        );

        if (existingWallet) {
          result.skipped++;
          continue;
        }

        await walletCreationService.createWallet(
          profile.userId as Types.ObjectId,
          DEFAULT_WALLET_CURRENCY,
        );

        result.created++;
      } catch (error) {
        result.failed++;

        result.failedUserIds.push(profile.userId.toString());

        console.error(
          `[WalletBackfill] Failed for user ${profile.userId.toString()}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    result.completedAt = new Date();

    return result;
  }
}

export const walletBackfillService = new WalletBackfillService();
