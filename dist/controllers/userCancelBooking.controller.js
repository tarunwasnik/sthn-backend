"use strict";
//backend/src/controllers/userCancelBooking.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBookingByUser = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const cancelBookingByUser = async (req, res) => {
    const rawUser = req.user;
    const userId = rawUser?.id ||
        rawUser?._id ||
        rawUser?.userId;
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const { bookingId } = req.body;
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const booking = await booking_model_1.Booking.findById(bookingId).session(session);
        if (!booking)
            throw new Error("Booking not found");
        if (String(booking.userId) !== String(userId)) {
            throw new Error("Not authorized");
        }
        const status = booking.status;
        if (!["REQUESTED", "CONFIRMED"].includes(status)) {
            throw new Error("Booking not cancellable");
        }
        booking.status = "CANCELLED";
        if (booking.paymentStatus === "PAID") {
            booking.paymentStatus = "REFUNDED";
        }
        await slot_model_1.Slot.updateMany({ _id: { $in: booking.slotIds } }, { status: "AVAILABLE" }, { session });
        await booking.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.json({ message: "Booking cancelled", booking });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: err.message });
    }
};
exports.cancelBookingByUser = cancelBookingByUser;
