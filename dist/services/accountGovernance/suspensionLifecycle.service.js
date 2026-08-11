"use strict";
//backend/src/services/accountGovernance/suspensionLifecycle.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerSuspensionLifecycle = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const slot_model_1 = require("../../models/slot.model");
const accountGovernance_1 = require("../../constants/accountGovernance");
const accountGovernanceResolver_service_1 = require("./accountGovernanceResolver.service");
const bookingTerminationType_enum_1 = require("../../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../financial/bookingFinancialTermination.service");
/* =========================================================
   HELPERS
========================================================= */
const addHours = (date, hours) => {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
};
/* =========================================================
   PROCESS BOOKINGS FOR SUSPENSION
========================================================= */
const processSuspensionBookings = async (userId, triggeredAt, protectedUntil, session) => {
    const bookings = await booking_model_1.Booking.find({
        $or: [{ userId }, { creatorId: userId }],
        status: {
            $in: ["REQUESTED", "CONFIRMED"],
        },
    }).session(session);
    const protectedBookingIds = [];
    const processedBookingIds = [];
    for (const booking of bookings) {
        /* =====================================================
           REQUESTED BOOKINGS
        ===================================================== */
        if (booking.status === "REQUESTED") {
            processedBookingIds.push(booking._id);
            continue;
        }
        /* =====================================================
           CONFIRMED BOOKINGS
        ===================================================== */
        if (booking.status === "CONFIRMED") {
            const slots = await slot_model_1.Slot.find({
                _id: {
                    $in: booking.slotIds,
                },
            })
                .sort({ startTime: 1 })
                .session(session);
            const firstSlot = slots[0];
            if (!firstSlot) {
                throw new Error(`Confirmed booking ${booking._id.toString()} has no slots`);
            }
            const bookingStartTime = new Date(firstSlot.startTime);
            const isAlreadyStarted = bookingStartTime.getTime() <= triggeredAt.getTime();
            const startsInsideProtectionWindow = bookingStartTime.getTime() > triggeredAt.getTime() &&
                bookingStartTime.getTime() <= protectedUntil.getTime();
            if (isAlreadyStarted || startsInsideProtectionWindow) {
                protectedBookingIds.push(booking._id);
                continue;
            }
            processedBookingIds.push(booking._id);
            continue;
        }
    }
    return {
        protectedBookingIds,
        processedBookingIds,
    };
};
/* =========================================================
   TRIGGER SUSPENSION
========================================================= */
const triggerSuspensionLifecycle = async ({ adminId, userId, reason, }) => {
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
        if (governance.condition === "SUSPENDED" ||
            governance.condition === "PENDING_SUSPENSION") {
            throw new Error("Suspension lifecycle is already active for this account");
        }
        const triggeredAt = new Date();
        const protectedUntil = addHours(triggeredAt, accountGovernance_1.SUSPENSION_BOOKING_PROTECTION_HOURS);
        const { protectedBookingIds, processedBookingIds } = await processSuspensionBookings(userId, triggeredAt, protectedUntil, session);
        const hasProtectedBookings = protectedBookingIds.length > 0;
        user.governanceState = hasProtectedBookings
            ? accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION
            : accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
        user.governanceTriggeredAt = triggeredAt;
        user.governanceReason = reason.trim();
        user.governanceTriggeredBy = new mongoose_1.default.Types.ObjectId(adminId);
        user.suspensionProtectedUntil = hasProtectedBookings
            ? protectedUntil
            : null;
        /*
         * Legacy status remains synchronized temporarily.
         *
         * PENDING_SUSPENSION must remain "active" because the account
         * still has full dashboard access while protected bookings
         * are being resolved.
         *
         * Final SUSPENDED keeps the legacy field synchronized until
         * all old status consumers are migrated to governanceState.
         */
        user.status = hasProtectedBookings ? "active" : "suspended";
        await user.save({ session });
        await session.commitTransaction();
        for (const bookingId of processedBookingIds) {
            await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
                bookingId: bookingId.toString(),
                actorType: bookingTerminationType_enum_1.BookingTerminationActorType.GOVERNANCE,
                actorId: adminId,
                terminationType: bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED,
                reason: reason.trim(),
            });
        }
        return {
            userId: user._id,
            governanceState: user.governanceState,
            triggeredAt,
            protectedUntil: user.suspensionProtectedUntil,
            protectedBookingIds,
            processedBookingIds,
            reason: user.governanceReason,
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
