import User from "../../models/User";

const FAILURE_THRESHOLD = 5;
const MAX_COOLDOWN_MINUTES = 30;

export const passwordChangeCooldownUntil = (failures: number, now = new Date()) => {
  if (failures < FAILURE_THRESHOLD) return null;
  return new Date(now.getTime() + Math.min(MAX_COOLDOWN_MINUTES, 2 ** (failures - FAILURE_THRESHOLD)) * 60_000);
};

export const recordFailedPasswordChange = async (userId: string, now = new Date()) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, $or: [{ passwordChangeCooldownUntil: null }, { passwordChangeCooldownUntil: { $lte: now } }, { passwordChangeCooldownUntil: { $exists: false } }] },
    { $inc: { passwordChangeFailures: 1 } },
    { new: true },
  ).select("passwordChangeFailures");
  if (!user) return null;
  const until = passwordChangeCooldownUntil(user.passwordChangeFailures ?? 0, now);
  if (until) await User.updateOne(
    { _id: user._id, passwordChangeFailures: user.passwordChangeFailures },
    { $set: { passwordChangeCooldownUntil: until } },
  );
  return until;
};

export const clearPasswordChangeFailures = (userId: string) => User.updateOne(
  { _id: userId },
  { $set: { passwordChangeFailures: 0, passwordChangeCooldownUntil: null } },
);
