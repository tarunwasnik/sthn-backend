import crypto from "crypto";
import { AuthThrottle, AuthThrottleScope } from "../../models/authThrottle.model";

export const AUTH_THROTTLE_POLICIES = {
  loginIp: { scope: "LOGIN_IP" as const, limit: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  loginIdentifier: { scope: "LOGIN_IDENTIFIER" as const, limit: 12, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  registerIp: { scope: "REGISTER_IP" as const, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  registerIdentifier: { scope: "REGISTER_IDENTIFIER" as const, limit: 3, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  passwordChangeIp: { scope: "PASSWORD_CHANGE_IP" as const, limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
};

export type AuthThrottlePolicy = typeof AUTH_THROTTLE_POLICIES[keyof typeof AUTH_THROTTLE_POLICIES];

const throttleKey = (scope: AuthThrottleScope, value: string) => {
  const secret = process.env.AUTH_THROTTLE_PEPPER || process.env.JWT_SECRET;
  if (!secret) throw new Error("Authentication throttle key is not configured");
  return crypto.createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
};

export const normalizedAuthIdentifier = (value: unknown) => typeof value === "string"
  ? value.trim().toLowerCase().slice(0, 320)
  : "invalid";

export const clientNetworkIdentity = (ip: string | undefined) => String(ip || "unknown").slice(0, 128);

export const consumeAuthThrottle = async (policy: AuthThrottlePolicy, identity: string, now = new Date()) => {
  const keyHash = throttleKey(policy.scope, identity);
  const resetAt = new Date(now.getTime() - policy.windowMs);
  const expiresAt = new Date(now.getTime() + Math.max(policy.windowMs, policy.blockMs) + 24 * 60 * 60_000);
  const result = await AuthThrottle.findOneAndUpdate(
    { scope: policy.scope, keyHash, $or: [{ blockedUntil: null }, { blockedUntil: { $lte: now } }, { blockedUntil: { $exists: false } }] },
    [{
      $set: {
        scope: policy.scope,
        keyHash,
        windowStartedAt: { $cond: [{ $or: [{ $eq: [{ $ifNull: ["$windowStartedAt", null] }, null] }, { $lte: ["$windowStartedAt", resetAt] }] }, now, "$windowStartedAt"] },
        count: { $cond: [{ $or: [{ $eq: [{ $ifNull: ["$windowStartedAt", null] }, null] }, { $lte: ["$windowStartedAt", resetAt] }] }, 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }] },
        blockedUntil: null,
        expiresAt,
      },
    }],
    { new: true, upsert: true, updatePipeline: true },
  );
  if (!result) {
    const blocked = await AuthThrottle.findOne({ scope: policy.scope, keyHash }).select("blockedUntil").lean();
    const retryAfterSeconds = blocked?.blockedUntil && blocked.blockedUntil > now
      ? Math.max(1, Math.ceil((blocked.blockedUntil.getTime() - now.getTime()) / 1000))
      : Math.ceil(policy.blockMs / 1000);
    return { allowed: false as const, retryAfterSeconds };
  }
  if (result.count <= policy.limit) return { allowed: true as const, retryAfterSeconds: 0 };
  const blockedUntil = new Date(now.getTime() + policy.blockMs);
  await AuthThrottle.updateOne(
    { _id: result._id, blockedUntil: null },
    { $set: { blockedUntil, expiresAt: new Date(blockedUntil.getTime() + 24 * 60 * 60_000) } },
  );
  return { allowed: false as const, retryAfterSeconds: Math.ceil(policy.blockMs / 1000) };
};
