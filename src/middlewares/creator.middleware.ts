//backend/src/middlewares/creator.middleware.ts

import { Response, NextFunction } from "express";
import { Request } from "express";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CREATOR_STATUS } from "../constants/creatorStatus";
import { ROLES } from "../constants/roles";

export const requireActiveCreator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  // Must be authenticated
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Must have creator role
  if (user.role !== ROLES.CREATOR) {
    return res
      .status(403)
      .json({ message: "Creator access required" });
  }

  // Must have an active creator profile
  const creatorProfile = await CreatorProfile.findOne({
    userId: user.id,
  });

  if (!creatorProfile) {
    return res
      .status(403)
      .json({ message: "Creator profile not found" });
  }

  if (creatorProfile.status !== CREATOR_STATUS.ACTIVE) {
    return res.status(403).json({
      message: "Creator account is not active",
    });
  }

  // Attach creatorProfile for downstream use
  (req as any).creatorProfile = creatorProfile;

  next();
};