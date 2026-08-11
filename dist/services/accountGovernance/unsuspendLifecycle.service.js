"use strict";
//backend/src/services/accountGovernance/unsuspendLifecycle.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSuspensionLifecycle = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const accountGovernance_1 = require("../../constants/accountGovernance");
const accountGovernanceResolver_service_1 = require("./accountGovernanceResolver.service");
/* =========================================================
   REMOVE SUSPENSION
========================================================= */
const removeSuspensionLifecycle = async ({ adminId, userId, reason, }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid target user id");
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(adminId)) {
        throw new Error("Invalid admin id");
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        throw new Error("Unsuspension reason is required");
    }
    if (adminId === userId) {
        throw new Error("Admin cannot unsuspend themselves");
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const user = await User_1.default.findById(userId).session(session);
        if (!user) {
            throw new Error("User not found");
        }
        /* =======================================================
           HIGHER AUTHORITY GUARD
        ======================================================= */
        if (user.governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.BANNED ||
            user.governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_BAN) {
            throw new Error("Suspension cannot be removed while a higher ban lifecycle is active");
        }
        /* =======================================================
           SUSPENSION STATE GUARD
        ======================================================= */
        if (user.governanceState !== accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.SUSPENDED &&
            user.governanceState !== accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION) {
            throw new Error("Account does not have an active suspension lifecycle");
        }
        const previousGovernanceState = user.governanceState;
        /* =======================================================
           REMOVE ONLY SUSPENSION AUTHORITY
        ======================================================= */
        user.governanceState = accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.ACTIVE;
        user.governanceTriggeredAt = null;
        user.governanceReason = null;
        user.governanceTriggeredBy = null;
        user.suspensionProtectedUntil = null;
        /*
         * Legacy status synchronization.
         *
         * Cooldowns remain untouched.
         * The governance resolver will expose COOLDOWN if either
         * cooldown timestamp is still active.
         */
        user.status = "active";
        await user.save({ session });
        /*
         * Resolve the state after suspension authority is removed.
         */
        const resolvedGovernance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user);
        await session.commitTransaction();
        return {
            userId: user._id,
            previousGovernanceState,
            governanceState: user.governanceState,
            effectiveCondition: resolvedGovernance.condition,
            cooldownActive: resolvedGovernance.isCooldownActive,
            userCooldownActive: resolvedGovernance.isUserCooldownActive,
            creatorCooldownActive: resolvedGovernance.isCreatorCooldownActive,
            cooldownUntil: resolvedGovernance.cooldownUntil,
            reason: reason.trim(),
        };
    }
    catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        throw error;
    }
    finally {
        await session.endSession();
    }
};
exports.removeSuspensionLifecycle = removeSuspensionLifecycle;
