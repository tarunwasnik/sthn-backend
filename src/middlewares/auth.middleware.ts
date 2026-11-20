// backend/src/middlewares/auth.middleware.ts

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { Role } from "../constants/roles";
import { validAuthSession } from "../services/authSession.service";

interface JwtPayload {
  id: string;
  role: Role;
  sid?: string;
}

const authenticate = (allowRestrictedRead: boolean) => async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    if (!decoded.sid || !(await validAuthSession(decoded.sid, decoded.id))) return res.status(401).json({ message: "Session expired or revoked" });

    // Always trust DB for authoritative state
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!allowRestrictedRead && user.status === "suspended") {
      return res.status(403).json({
        message: "Account suspended. Contact support.",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        message: "Account permanently banned.",
      });
    }

    // Attach authenticated user context
    req.user = user;
    (req as Request & { authSessionId?: string }).authSessionId = decoded.sid;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const protect = authenticate(false);

/**
 * Suspended accounts may read their own status and financial history, but
 * remain subject to all role and active-Creator mutation guards. Banned
 * accounts remain blocked by the base authentication policy.
 */
export const protectRestrictedRead = authenticate(true);
