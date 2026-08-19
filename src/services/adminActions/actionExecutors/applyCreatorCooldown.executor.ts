//backend/src/services/adminActions/actionExecutors/applyCreatorCooldown.executor.ts

import { CreatorProfile } from "../../../models/creatorProfile.model";
import { applyAccountCooldown } from "../../accountGovernance/cooldownLifecycle.service";
import mongoose from "mongoose";
import { createAuditLog } from "../../auditLog.service";

type Input = {
  adminId: string;
  creatorProfileId: string;
  days: number;
  reason: string;
};

export const applyCreatorCooldownExecutor = async ({
  adminId,
  creatorProfileId,
  days,
  reason,
}: Input) => {
  const creatorProfile = await CreatorProfile.findById(creatorProfileId);
  if (!creatorProfile) throw new Error("Creator profile not found");

  const until = new Date();
  until.setDate(until.getDate() + days);
  const { user, replay } = await applyAccountCooldown({
    userId: creatorProfile.userId.toString(), kind: "CREATOR", until, reason, actorId: adminId,
  });

  // Legacy profile field is compatibility metadata only; resolver never reads it.
  creatorProfile.creatorCooldownUntil = user.creatorCooldownUntil;
  await creatorProfile.save();
  if (!replay) {
    await createAuditLog({ actorType: "ADMIN", actorId: new mongoose.Types.ObjectId(adminId), action: "CREATOR_COOLDOWN_APPLIED", entityType: "USER", entityId: user._id, after: { creatorCooldownUntil: user.creatorCooldownUntil, reason } });
  }

  return {
    userId: user._id,
    creatorProfileId: creatorProfile._id,
    cooldownUntil: user.creatorCooldownUntil,
    reason,
    replay,
  };
};
