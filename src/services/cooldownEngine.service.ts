//backend/src/services/cooldownEngine.service.ts


import User from "../models/User";

const nowPlus = (hours: number) =>
  new Date(Date.now() + hours * 60 * 60 * 1000);

export const applyCooldownIfNeeded = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) return;

  const score = user.abuseScore;

  let userCooldown: Date | undefined;
  let creatorCooldown: Date | undefined;

  if (score >= 80) {
    userCooldown = nowPlus(90 * 24);
    creatorCooldown = nowPlus(30 * 24);
  } else if (score >= 60) {
    userCooldown = nowPlus(30 * 24);
    creatorCooldown = nowPlus(7 * 24);
  } else if (score >= 40) {
    userCooldown = nowPlus(7 * 24);
    creatorCooldown = nowPlus(24);
  } else if (score >= 20) {
    userCooldown = nowPlus(24);
  }

  await User.updateOne(
    { _id: userId },
    {
      ...(userCooldown && { userCooldownUntil: userCooldown }),
      ...(creatorCooldown && { creatorCooldownUntil: creatorCooldown }),
    }
  );
};