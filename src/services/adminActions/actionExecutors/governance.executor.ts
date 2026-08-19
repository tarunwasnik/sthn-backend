import mongoose from "mongoose";

import User from "../../../models/User";
import { createAuditLog } from "../../auditLog.service";
import { triggerSuspensionLifecycle } from "../../accountGovernance/suspensionLifecycle.service";
import { removeSuspensionLifecycle } from "../../accountGovernance/unsuspendLifecycle.service";
import { triggerBanLifecycle } from "../../accountGovernance/banLifecycle.service";
import { resetAccountTrust } from "../../accountGovernance/cooldownLifecycle.service";

type GovernanceActionKey = "SUSPEND_USER" | "ACTIVATE_USER" | "BAN_USER" | "RESET_USER_TRUST";
type Input = { adminId: string; userId: string; reason: string; action: GovernanceActionKey; dryRun: boolean };

const safeState = (user: { _id: mongoose.Types.ObjectId; governanceState: string; status: string }) => ({
  targetUserId: String(user._id), governanceState: user.governanceState, status: user.status,
});

const auditActionFor: Record<GovernanceActionKey, string> = {
  SUSPEND_USER: "USER_SUSPENDED", ACTIVATE_USER: "USER_ACTIVATED", BAN_USER: "USER_BANNED", RESET_USER_TRUST: "USER_TRUST_RESET",
};

export const executeGovernanceAction = async ({ adminId, userId, reason, action, dryRun }: Input) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error("Invalid target user id");
  if (adminId === userId) throw new Error("Admin cannot perform governance actions on themselves");
  const current = await User.findById(userId).select("governanceState status abuseScore userCooldownUntil creatorCooldownUntil").lean();
  if (!current) throw new Error("User not found");

  if (dryRun) {
    const targetState = action === "SUSPEND_USER" ? "SUSPENDED" : action === "BAN_USER" ? "BANNED" : action === "ACTIVATE_USER" ? "ACTIVE" : current.governanceState;
    const blocked = action === "ACTIVATE_USER" && current.governanceState === "BANNED";
    return {
      blocked,
      reason: blocked ? "Suspension cannot be removed while a higher ban lifecycle is active" : undefined,
      diff: blocked ? {} : { governanceState: { before: current.governanceState, after: targetState } },
      summary: blocked ? "No changes will be made" : `${action} is valid for this account`,
      result: { action, previousGovernanceState: current.governanceState, governanceState: targetState, status: targetState.toLowerCase() },
    };
  }

  let result: Record<string, unknown>;
  if (action === "SUSPEND_USER") {
    const lifecycle = await triggerSuspensionLifecycle({ adminId, userId, reason });
    result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: lifecycle.status, reason: lifecycle.reason, effectiveAt: lifecycle.triggeredAt, replay: lifecycle.replay, consequences: lifecycle.consequences };
  } else if (action === "BAN_USER") {
    const lifecycle = await triggerBanLifecycle({ adminId, userId, reason });
    result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: lifecycle.status, reason: lifecycle.reason, effectiveAt: lifecycle.triggeredAt, replay: lifecycle.replay, consequences: lifecycle.consequences };
  } else if (action === "ACTIVATE_USER") {
    const lifecycle = await removeSuspensionLifecycle({ adminId, userId, reason });
    result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: "active", reason: lifecycle.reason, effectiveCondition: lifecycle.effectiveCondition, cooldownActive: lifecycle.cooldownActive };
  } else {
    const user = await resetAccountTrust(userId);
    result = { action, ...safeState(user), abuseScore: user.abuseScore, userCooldownCleared: true, creatorCooldownCleared: true };
  }

  await createAuditLog({
    actorType: "ADMIN", actorId: new mongoose.Types.ObjectId(adminId), action: auditActionFor[action], entityType: "USER", entityId: new mongoose.Types.ObjectId(userId),
    before: { governanceState: current.governanceState, status: current.status }, after: result,
  });
  return { summary: `${action} executed`, result };
};
