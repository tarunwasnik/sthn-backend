import User from "../../models/User";

const FAILURE_THRESHOLD = 5;
const MAX_COOLDOWN_MINUTES = 30;

export const loginCooldownUntil = (failures: number, now = new Date()) => {
  if (failures < FAILURE_THRESHOLD) return null;
  const minutes = Math.min(MAX_COOLDOWN_MINUTES, 2 ** (failures - FAILURE_THRESHOLD));
  return new Date(now.getTime() + minutes * 60_000);
};

export const recordFailedLogin = async (email: string, now = new Date()) => {
  const user = await User.findOneAndUpdate(
    { email, $or: [{ loginCooldownUntil: null }, { loginCooldownUntil: { $lte: now } }, { loginCooldownUntil: { $exists: false } }] },
    { $inc: { loginFailureCount: 1 } },
    { new: true },
  ).select("loginFailureCount");
  if (!user) return null;
  const until = loginCooldownUntil(user.loginFailureCount ?? 0, now);
  if (until) await User.updateOne({ _id: user._id, loginFailureCount: user.loginFailureCount }, { $set: { loginCooldownUntil: until } });
  return until;
};

export const clearLoginFailures = (userId: string) => User.updateOne(
  { _id: userId },
  { $set: { loginFailureCount: 0, loginCooldownUntil: null } },
);
