"use strict";
//backend/src/services/accountGovernance/suspensionFinalizer.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizePendingSuspension = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const accountGovernance_1 = require("../../constants/accountGovernance");
/* =========================================================
   FINALIZE PENDING SUSPENSION
========================================================= */
const finalizePendingSuspension = async ({ userId, }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid target user id");
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const user = await User_1.default.findById(userId).session(session);
        if (!user) {
            throw new Error("User not found");
        }
        if (user.governanceState !== accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION) {
            await session.commitTransaction();
            return {
                finalized: false,
                reason: "Account is not pending suspension",
                governanceState: user.governanceState,
            };
        }
        /*
         * Protected suspension bookings are the CONFIRMED bookings
         * that survived suspension-trigger processing.
         *
         * If any CONFIRMED booking still exists in either direction,
         * suspension must remain pending.
         */
        const protectedBooking = await booking_model_1.Booking.findOne({
            $or: [{ userId }, { creatorId: userId }],
            status: "CONFIRMED",
        })
            .select("_id")
            .session(session);
        if (protectedBooking) {
            await session.commitTransaction();
            return {
                finalized: false,
                reason: "Protected booking obligations still exist",
                governanceState: user.governanceState,
                blockingBookingId: protectedBooking._id,
            };
        }
        /*
         * No protected CONFIRMED booking remains.
         *
         * Final suspension now becomes authoritative.
         */
        user.governanceState = accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
        user.status = "suspended";
        user.suspensionProtectedUntil = null;
        await user.save({ session });
        await session.commitTransaction();
        return {
            finalized: true,
            governanceState: user.governanceState,
            suspendedAt: new Date(),
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
exports.finalizePendingSuspension = finalizePendingSuspension;
