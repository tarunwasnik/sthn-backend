"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeGovernanceAction = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../../models/User"));
const auditLog_service_1 = require("../../auditLog.service");
const suspensionLifecycle_service_1 = require("../../accountGovernance/suspensionLifecycle.service");
const unsuspendLifecycle_service_1 = require("../../accountGovernance/unsuspendLifecycle.service");
const banLifecycle_service_1 = require("../../accountGovernance/banLifecycle.service");
const cooldownLifecycle_service_1 = require("../../accountGovernance/cooldownLifecycle.service");
const safeState = (user) => ({
    targetUserId: String(user._id), governanceState: user.governanceState, status: user.status,
});
const auditActionFor = {
    SUSPEND_USER: "USER_SUSPENDED", ACTIVATE_USER: "USER_ACTIVATED", BAN_USER: "USER_BANNED", RESET_USER_TRUST: "USER_TRUST_RESET",
};
const executeGovernanceAction = async ({ adminId, userId, reason, action, dryRun }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId))
        throw new Error("Invalid target user id");
    if (adminId === userId)
        throw new Error("Admin cannot perform governance actions on themselves");
    const current = await User_1.default.findById(userId).select("governanceState status abuseScore userCooldownUntil creatorCooldownUntil").lean();
    if (!current)
        throw new Error("User not found");
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
    let result;
    if (action === "SUSPEND_USER") {
        const lifecycle = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId, userId, reason });
        result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: lifecycle.status, reason: lifecycle.reason, effectiveAt: lifecycle.triggeredAt, replay: lifecycle.replay, consequences: lifecycle.consequences };
    }
    else if (action === "BAN_USER") {
        const lifecycle = await (0, banLifecycle_service_1.triggerBanLifecycle)({ adminId, userId, reason });
        result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: lifecycle.status, reason: lifecycle.reason, effectiveAt: lifecycle.triggeredAt, replay: lifecycle.replay, consequences: lifecycle.consequences };
    }
    else if (action === "ACTIVATE_USER") {
        const lifecycle = await (0, unsuspendLifecycle_service_1.removeSuspensionLifecycle)({ adminId, userId, reason });
        result = { action, targetUserId: String(lifecycle.userId), previousGovernanceState: lifecycle.previousGovernanceState, governanceState: lifecycle.governanceState, status: "active", reason: lifecycle.reason, effectiveCondition: lifecycle.effectiveCondition, cooldownActive: lifecycle.cooldownActive };
    }
    else {
        const user = await (0, cooldownLifecycle_service_1.resetAccountTrust)(userId);
        result = { action, ...safeState(user), abuseScore: user.abuseScore, userCooldownCleared: true, creatorCooldownCleared: true };
    }
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(adminId), action: auditActionFor[action], entityType: "USER", entityId: new mongoose_1.default.Types.ObjectId(userId),
        before: { governanceState: current.governanceState, status: current.status }, after: result,
    });
    return { summary: `${action} executed`, result };
};
exports.executeGovernanceAction = executeGovernanceAction;
