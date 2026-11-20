import { NextFunction, Request, Response } from "express";
import { AUTH_THROTTLE_POLICIES, clientNetworkIdentity, consumeAuthThrottle, normalizedAuthIdentifier } from "../services/auth/authThrottle.service";

const reject = (res: Response, retryAfterSeconds: number) => {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ message: "Too many attempts. Please try again later.", code: "AUTH_RATE_LIMITED" });
};

const protectedBy = (policies: Array<{ policy: typeof AUTH_THROTTLE_POLICIES[keyof typeof AUTH_THROTTLE_POLICIES]; identity: (req: Request) => string }>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    for (const { policy, identity } of policies) {
      const result = await consumeAuthThrottle(policy, identity(req));
      if (!result.allowed) return reject(res, result.retryAfterSeconds);
    }
    return next();
  } catch {
    return res.status(503).json({ message: "Authentication protection is temporarily unavailable. Please try again later.", code: "AUTH_PROTECTION_UNAVAILABLE" });
  }
};

const network = (req: Request) => clientNetworkIdentity(req.ip);
const identifier = (req: Request) => normalizedAuthIdentifier(req.body?.email);

export const throttleLogin = protectedBy([{ policy: AUTH_THROTTLE_POLICIES.loginIp, identity: network }, { policy: AUTH_THROTTLE_POLICIES.loginIdentifier, identity: identifier }]);
export const throttleRegistration = protectedBy([{ policy: AUTH_THROTTLE_POLICIES.registerIp, identity: network }, { policy: AUTH_THROTTLE_POLICIES.registerIdentifier, identity: identifier }]);
export const throttlePasswordChange = protectedBy([{ policy: AUTH_THROTTLE_POLICIES.passwordChangeIp, identity: network }]);
