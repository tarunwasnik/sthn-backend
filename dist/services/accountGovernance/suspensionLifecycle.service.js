"use strict";
//backend/src/services/accountGovernance/suspensionLifecycle.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerSuspensionLifecycle = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const accountGovernance_1 = require("../../constants/accountGovernance");
const accountGovernanceResolver_service_1 = require("./accountGovernanceResolver.service");
const governanceBookingOrchestration_service_1 = require("./governanceBookingOrchestration.service");
/* =========================================================
   TRIGGER SUSPENSION
========================================================= */
const triggerSuspensionLifecycle = async ({ adminId, userId, reason, now: inputNow = new Date(), }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid target user id");
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(adminId)) {
        throw new Error("Invalid admin id");
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        throw new Error("Suspension reason is required");
    }
    if (adminId === userId) {
        throw new Error("Admin cannot suspend themselves");
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const user = await User_1.default.findById(userId).session(session);
        if (!user) {
            throw new Error("User not found");
        }
        const governance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user);
        if (governance.condition === "BANNED" ||
            governance.condition === "PENDING_BAN") {
            throw new Error("Suspension cannot override an active ban lifecycle");
        }
        const isReplay = governance.condition === "SUSPENDED" ||
            governance.condition === "PENDING_SUSPENSION";
        const previousGovernanceState = user.governanceState;
        const triggeredAt = user.governanceTriggeredAt ?? new Date();
        /*
         * G1 establishes canonical account authority only.  Booking classification
         * and Wallet-compatible termination are deferred until their financial
         * release contract exists; this transition must not pretend to process them.
         */
        if (!isReplay) {
            user.governanceState = accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
            user.governanceTriggeredAt = triggeredAt;
            user.governanceReason = reason.trim();
            user.governanceTriggeredBy = new mongoose_1.default.Types.ObjectId(adminId);
            user.suspensionProtectedUntil = null;
        }
        /*
         * Legacy status remains synchronized temporarily.
         *
         * Legacy status remains a compatibility projection while governanceState
         * is the decision authority.
         */
        user.status = "suspended";
        await user.save({ session });
        await session.commitTransaction();
        const consequences = await (0, governanceBookingOrchestration_service_1.orchestrateGovernanceBookingConsequences)({
            governedUserId: userId,
            adminId,
            reason: user.governanceReason ?? reason.trim(),
            now: inputNow,
        });
        return {
            userId: user._id,
            previousGovernanceState,
            governanceState: user.governanceState,
            triggeredAt,
            status: user.status,
            reason: user.governanceReason,
            bookingsMutated: consequences.terminatedCount > 0,
            consequences,
            replay: isReplay,
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
exports.triggerSuspensionLifecycle = triggerSuspensionLifecycle;
