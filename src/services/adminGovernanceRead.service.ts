import mongoose from "mongoose";

import User from "../models/User";
import { CreatorProfile } from "../models/creatorProfile.model";
import { resolveAccountGovernance } from "./accountGovernance/accountGovernanceResolver.service";
import { AppError } from "../utils/AppError";

const iso = (value?: Date | null) => value ? value.toISOString() : null;

/** Read-only, deliberately bounded DTO for the Admin Governance workspace. */
export const getAdminGovernanceTarget = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new AppError("Invalid user id", 400);
  const user = await User.findById(userId).select([
    "email role status creatorStatus governanceState governanceReason governanceTriggeredAt governanceTriggeredBy",
    "userCooldownUntil userCooldownReason userCooldownTriggeredAt",
    "creatorCooldownUntil creatorCooldownReason creatorCooldownTriggeredAt abuseScore",
  ].join(" "));
  if (!user) throw new AppError("User not found", 404);
  const creator = await CreatorProfile.findOne({ userId: user._id }).select("status creatorCooldownUntil").lean();
  const resolved = resolveAccountGovernance(user);
  return {
    user: {
      id: String(user._id), email: user.email, role: user.role, status: user.status,
      creatorStatus: user.creatorStatus, governanceState: user.governanceState,
      governanceReason: user.governanceReason ?? null, governanceTriggeredAt: iso(user.governanceTriggeredAt),
      governanceTriggeredBy: user.governanceTriggeredBy ? String(user.governanceTriggeredBy) : null,
      userCooldownUntil: iso(user.userCooldownUntil), userCooldownReason: user.userCooldownReason ?? null,
      userCooldownTriggeredAt: iso(user.userCooldownTriggeredAt),
      creatorCooldownUntil: iso(user.creatorCooldownUntil), creatorCooldownReason: user.creatorCooldownReason ?? null,
      creatorCooldownTriggeredAt: iso(user.creatorCooldownTriggeredAt), abuseScore: user.abuseScore,
    },
    creator: creator ? {
      creatorProfileId: String(creator._id), status: creator.status,
      creatorCooldownUntil: iso(creator.creatorCooldownUntil),
    } : null,
    resolved: {
      condition: resolved.condition, governanceState: resolved.governanceState,
      isCooldownActive: resolved.isCooldownActive, isUserCooldownActive: resolved.isUserCooldownActive,
      isCreatorCooldownActive: resolved.isCreatorCooldownActive, cooldownUntil: iso(resolved.cooldownUntil),
      blocksOutgoingBookings: resolved.blocksOutgoingBookings, blocksIncomingBookings: resolved.blocksIncomingBookings,
      blocksAcceptingBookings: resolved.blocksAcceptingBookings, hasRestrictedDashboardAccess: resolved.hasRestrictedDashboardAccess,
      hasNoAccountAccess: resolved.hasNoAccountAccess,
    },
  };
};
