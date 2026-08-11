"use strict";
//backend/src/services/admin/walletBackfill.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletBackfillService = exports.WalletBackfillService = void 0;
const userProfile_model_1 = require("../../models/userProfile.model");
const walletCreation_service_1 = require("../wallet/walletCreation.service");
class WalletBackfillService {
    /**
     * Backfill wallets for every verified user.
     */
    async backfillVerifiedUsers() {
        const startedAt = new Date();
        const verifiedProfiles = await userProfile_model_1.UserProfile.find({
            profileStatus: "verified",
        })
            .select("userId")
            .sort({
            createdAt: 1,
        })
            .lean();
        const result = {
            startedAt,
            completedAt: startedAt,
            scanned: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            failedUserIds: [],
        };
        console.info(`[WalletBackfill] Starting wallet backfill for ${verifiedProfiles.length} verified users.`);
        for (let index = 0; index < verifiedProfiles.length; index++) {
            const profile = verifiedProfiles[index];
            result.scanned++;
            console.info(`[WalletBackfill] Processing ${index + 1}/${verifiedProfiles.length}`);
            if (!profile.userId) {
                result.failed++;
                result.failedUserIds.push("UNKNOWN");
                console.error("[WalletBackfill] Profile is missing a valid userId.");
                continue;
            }
            try {
                const existingWallet = await walletCreation_service_1.walletCreationService.getWallet(profile.userId);
                if (existingWallet) {
                    result.skipped++;
                    continue;
                }
                await walletCreation_service_1.walletCreationService.createWallet(profile.userId);
                result.created++;
            }
            catch (error) {
                result.failed++;
                result.failedUserIds.push(profile.userId.toString());
                console.error(`[WalletBackfill] Failed for user ${profile.userId.toString()}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
    async backfillUsers(userIds) {
        const startedAt = new Date();
        const verifiedProfiles = await userProfile_model_1.UserProfile.find({
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
        const result = {
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
                const existingWallet = await walletCreation_service_1.walletCreationService.getWallet(profile.userId);
                if (existingWallet) {
                    result.skipped++;
                    continue;
                }
                await walletCreation_service_1.walletCreationService.createWallet(profile.userId);
                result.created++;
            }
            catch (error) {
                result.failed++;
                result.failedUserIds.push(profile.userId.toString());
                console.error(`[WalletBackfill] Failed for user ${profile.userId.toString()}: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        }
        result.completedAt = new Date();
        return result;
    }
}
exports.WalletBackfillService = WalletBackfillService;
exports.walletBackfillService = new WalletBackfillService();
