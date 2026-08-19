//backend/src/services/adminActions/actionExecutors/revokeCreatorCooldown.executor.ts


import {CreatorProfile} from "../../../models/creatorProfile.model";
import { revokeAccountCooldown } from "../../accountGovernance/cooldownLifecycle.service";
import mongoose from "mongoose";
import { createAuditLog } from "../../auditLog.service";

type Input = {
  adminId: string;
  creatorProfileId: string;
  reason: string;
};

export const revokeCreatorCooldownExecutor = async ({
  adminId,
  creatorProfileId,
  reason,
}: Input) => {
  const creatorProfile = await CreatorProfile.findById(creatorProfileId);
  if (!creatorProfile) throw new Error("Creator profile not found");

  const { user, revoked } = await revokeAccountCooldown({
    userId: creatorProfile.userId.toString(), kind: "CREATOR",
  });
  creatorProfile.creatorCooldownUntil = null;
  await creatorProfile.save();
  if (revoked) {
    await createAuditLog({ actorType: "ADMIN", actorId: new mongoose.Types.ObjectId(adminId), action: "CREATOR_COOLDOWN_REVOKED", entityType: "USER", entityId: user._id, after: { creatorCooldownUntil: null } });
  }

  return {
    userId: user._id,
    creatorProfileId: creatorProfile._id,
    revoked,
    reason,
  };
};
