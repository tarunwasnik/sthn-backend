import mongoose from "mongoose";

import User from "../../models/User";

export type CooldownKind = "USER" | "CREATOR";

type ApplyCooldownInput = {
  userId: string;
  kind: CooldownKind;
  until: Date;
  reason?: string | null;
  actorId?: string | null;
};

type RevokeCooldownInput = {
  userId: string;
  kind: CooldownKind;
};

const assertInput = (userId: string, until?: Date) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error("Invalid target user id");
  if (until && until.getTime() <= Date.now()) throw new Error("Cooldown end date must be in the future");
};

const fieldsFor = (kind: CooldownKind) => kind === "USER"
  ? { until: "userCooldownUntil" as const, reason: "userCooldownReason" as const, by: "userCooldownBy" as const, triggeredAt: "userCooldownTriggeredAt" as const }
  : { until: "creatorCooldownUntil" as const, reason: "creatorCooldownReason" as const, by: "creatorCooldownBy" as const, triggeredAt: "creatorCooldownTriggeredAt" as const };

export const applyAccountCooldown = async ({ userId, kind, until, reason = null, actorId = null }: ApplyCooldownInput) => {
  assertInput(userId, until);
  if (actorId && !mongoose.Types.ObjectId.isValid(actorId)) throw new Error("Invalid cooldown actor id");
  const user = await User.findById(userId);
  if (!user) throw new Error("Target user not found");
  const fields = fieldsFor(kind);
  const existing = user[fields.until];
  if (existing && existing.getTime() >= until.getTime()) {
    return { user, until: existing, replay: true };
  }
  user[fields.until] = until;
  user[fields.reason] = reason?.trim() || null;
  user[fields.by] = actorId ? new mongoose.Types.ObjectId(actorId) : null;
  user[fields.triggeredAt] = new Date();
  await user.save();
  return { user, until, replay: false };
};

export const revokeAccountCooldown = async ({ userId, kind }: RevokeCooldownInput) => {
  assertInput(userId);
  const user = await User.findById(userId);
  if (!user) throw new Error("Target user not found");
  const fields = fieldsFor(kind);
  const wasPresent = Boolean(user[fields.until] || user[fields.reason] || user[fields.by] || user[fields.triggeredAt]);
  user[fields.until] = null;
  user[fields.reason] = null;
  user[fields.by] = null;
  user[fields.triggeredAt] = null;
  await user.save();
  return { user, revoked: wasPresent };
};

export const resetAccountTrust = async (userId: string) => {
  assertInput(userId);
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  user.abuseScore = 0;
  for (const kind of ["USER", "CREATOR"] as const) {
    const fields = fieldsFor(kind);
    user[fields.until] = null;
    user[fields.reason] = null;
    user[fields.by] = null;
    user[fields.triggeredAt] = null;
  }
  user.status = user.governanceState === "BANNED"
    ? "banned"
    : user.governanceState === "SUSPENDED"
      ? "suspended"
      : "active";
  await user.save();
  return user;
};
