//backend/src/services/adminActions/revokeCreatorCooldown.service.ts


import { revokeCreatorCooldownExecutor } from "./actionExecutors/revokeCreatorCooldown.executor";
import { CreatorProfile } from "../../models/creatorProfile.model";
import User from "../../models/User";

type Input = {
  adminId: string;
  creatorProfileId: string;
  reason: string;
  dryRun?: boolean;
};

export const revokeCreatorCooldownService = async ({
  adminId,
  creatorProfileId,
  reason,
  dryRun = false,
}: Input) => {
  const creatorProfile = await CreatorProfile.findById(creatorProfileId);

  if (!creatorProfile) {
    throw new Error("Creator profile not found");
  }

  const now = new Date();
  const targetUser = await User.findById(creatorProfile.userId).select("creatorCooldownUntil").lean();
  if (!targetUser) throw new Error("Target user not found");
  const currentCooldown = targetUser.creatorCooldownUntil ?? null;

  const hasCooldown = currentCooldown !== null;
  const isActiveCooldown = hasCooldown && currentCooldown.getTime() > now.getTime();

  // ==========================
  // 🔥 DRY RUN MODE (Phase 20.5)
  // ==========================
  if (dryRun) {
    if (!hasCooldown) {
      return {
        mode: "DRY_RUN",
        action: "REVOKE_CREATOR_COOLDOWN",
        blocked: true,
        reason: "Creator has no cooldown to revoke",
        currentState: {
          cooldownUntil: null,
        },
        diff: {},
        summary: "No changes will be made",
      };
    }

    if (!isActiveCooldown) {
      return {
        mode: "DRY_RUN",
        action: "REVOKE_CREATOR_COOLDOWN",
        blocked: true,
        reason: "Creator cooldown has already expired",
        currentState: {
          cooldownUntil: currentCooldown,
        },
        diff: {},
        summary: "No changes will be made",
      };
    }

    return {
      mode: "DRY_RUN",
      action: "REVOKE_CREATOR_COOLDOWN",
      currentState: {
        cooldownUntil: currentCooldown,
      },
      futureState: {
        cooldownUntil: null,
      },
      diff: {
        creatorCooldownUntil: {
          before: currentCooldown,
          after: null,
        },
      },
      impact: {
        bookingsUnblocked: true,
      },
      summary: "Creator cooldown will be revoked",
    };
  }

  // ==========================
  // 🔹 REAL EXECUTION MODE
  // ==========================
  return revokeCreatorCooldownExecutor({
    adminId,
    creatorProfileId,
    reason,
  });
};
