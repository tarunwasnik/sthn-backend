//backend/src/services/adminActions/actionExecutors/revokeCreatorCooldown.executor.ts


import User from "../../../models/User";
import {CreatorProfile} from "../../../models/creatorProfile.model";

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

  const user = await User.findById(creatorProfile.userId);
  if (!user) throw new Error("Target user not found");

  user.userCooldownUntil = undefined;
  user.userCooldownReason = reason;
  user.userCooldownBy = adminId as any;

  await user.save();

  return {
    userId: user._id,
    creatorProfileId: creatorProfile._id,
    revoked: true,
    reason,
  };
};