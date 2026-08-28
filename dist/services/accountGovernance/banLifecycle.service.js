"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerBanLifecycle = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const accountGovernance_1 = require("../../constants/accountGovernance");
const governanceBookingOrchestration_service_1 = require("./governanceBookingOrchestration.service");
/**
 * G1 account-state transition only. Booking consequences are deliberately
 * deferred until governance termination is Wallet-compatible.
 */
const triggerBanLifecycle = async ({ adminId, userId, reason, now: inputNow = new Date(), }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId))
        throw new Error("Invalid target user id");
    if (!mongoose_1.default.Types.ObjectId.isValid(adminId))
        throw new Error("Invalid admin id");
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        throw new Error("Ban reason is required");
    }
    if (adminId === userId)
        throw new Error("Admin cannot ban themselves");
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const user = await User_1.default.findById(userId).session(session);
        if (!user)
            throw new Error("User not found");
        const previousGovernanceState = user.governanceState;
        const isReplay = previousGovernanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.BANNED;
        if (isReplay) {
            await session.commitTransaction();
        }
        const triggeredAt = user.governanceTriggeredAt ?? inputNow;
        if (!isReplay) {
            user.governanceState = accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.BANNED;
            user.governanceTriggeredAt = triggeredAt;
            user.governanceReason = reason.trim();
            user.governanceTriggeredBy = new mongoose_1.default.Types.ObjectId(adminId);
            user.suspensionProtectedUntil = null;
            user.status = "banned";
            await user.save({ session });
            await session.commitTransaction();
        }
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
            status: user.status,
            reason: user.governanceReason,
            triggeredAt,
            replay: isReplay,
            bookingsMutated: consequences.terminatedCount > 0,
            consequences,
        };
    }
    catch (error) {
        if (session.inTransaction())
            await session.abortTransaction();
        throw error;
    }
    finally {
        await session.endSession();
    }
};
exports.triggerBanLifecycle = triggerBanLifecycle;
