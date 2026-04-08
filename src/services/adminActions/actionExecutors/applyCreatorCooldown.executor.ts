//backend/src/services/adminActions/actionExecutors/applyCreatorCooldown.executor.ts

import User from "../../../models/User";
import { CreatorProfile } from "../../../models/creatorProfile.model";

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

  const user = await User.findById(creatorProfile.userId);
  if (!user) throw new Error("Target user not found");

  const until = new Date();
  until.setDate(until.getDate() + days);

  // 🔹 USER LEVEL (enforcement)
  user.userCooldownUntil = until;
  user.userCooldownReason = reason;
  user.userCooldownBy = adminId as any;

  // 🔹 CREATOR PROFILE LEVEL (state tracking)
  creatorProfile.creatorCooldownUntil = until;

  await Promise.all([
    user.save(),
    creatorProfile.save(),
  ]);

  return {
    userId: user._id,
    creatorProfileId: creatorProfile._id,
    cooldownUntil: until,
    reason,
  };
};