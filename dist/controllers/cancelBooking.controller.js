"use strict";
//backend/src/controllers/cancelBooking.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBooking = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const interactionGuards_service_1 = require("../services/interactionGuards.service");
const suspensionFinalizer_service_1 = require("../services/accountGovernance/suspensionFinalizer.service");
const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    try {
        await (0, interactionGuards_service_1.assertCancellationAllowed)(bookingId);
    }
    catch (err) {
        if (err instanceof interactionGuards_service_1.InteractionGuardError) {
            return res.status(403).json({
                code: err.code,
                message: err.message,
            });
        }
        throw err;
    }
    const session = await mongoose_1.default.startSession();
    let affectedUserId = null;
    let affectedCreatorId = null;
    try {
        session.startTransaction();
        const booking = await booking_model_1.Booking.findById(bookingId).session(session);
        if (!booking) {
            throw new Error("Booking not found");
        }
        /*
          Lifecycle guard:
          Only REQUESTED and CONFIRMED bookings can be cancelled.
        */
        if (!["REQUESTED", "CONFIRMED"].includes(booking.status)) {
            throw new Error("Booking not cancellable");
        }
        const previousStatus = booking.status;
        /*
          Capture both booking participants before transaction completion.

          Either participant may currently be in:
          PENDING_SUSPENSION.
        */
        affectedUserId = booking.userId.toString();
        affectedCreatorId = booking.creatorId.toString();
        booking.status = "CANCELLED";
        /*
          Slot freeing must follow the same lifecycle contract
          used by user/creator cancellation.
        */
        if (previousStatus === "REQUESTED") {
            await slot_model_1.Slot.updateMany({
                _id: { $in: booking.slotIds },
                status: "LOCKED",
            }, {
                status: "AVAILABLE",
            }, { session });
        }
        if (previousStatus === "CONFIRMED") {
            await slot_model_1.Slot.updateMany({
                _id: { $in: booking.slotIds },
                status: "BOOKED",
            }, {
                status: "AVAILABLE",
            }, { session });
        }
        await booking.save({ session });
        await session.commitTransaction();
        /*
          Governance finalization happens AFTER the booking
          transaction commits.

          The finalizer starts its own transaction and must see
          the committed CANCELLED booking state.
        */
        if (affectedUserId) {
            await (0, suspensionFinalizer_service_1.finalizePendingSuspension)({
                userId: affectedUserId,
            });
        }
        if (affectedCreatorId && affectedCreatorId !== affectedUserId) {
            await (0, suspensionFinalizer_service_1.finalizePendingSuspension)({
                userId: affectedCreatorId,
            });
        }
        return res.status(200).json({
            message: "Booking cancelled",
        });
    }
    catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        return res.status(400).json({
            message: err.message,
        });
    }
    finally {
        await session.endSession();
    }
};
exports.cancelBooking = cancelBooking;
