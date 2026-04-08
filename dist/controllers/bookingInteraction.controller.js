"use strict";
// backend/src/controllers/bookingInteraction.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markBookingInteracted = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const markBookingInteracted = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    const booking = await booking_model_1.Booking.findOne({
        _id: bookingId,
        status: "CONFIRMED",
    });
    if (!booking) {
        return res.status(404).json({
            message: "Booking not found or not confirmed",
        });
    }
    if (String(booking.userId) !== String(user.id) &&
        String(booking.creatorId) !== String(user.id)) {
        return res.status(403).json({ message: "Access denied" });
    }
    const updatedBooking = await booking_model_1.Booking.findOneAndUpdate({
        _id: bookingId,
        hasInteracted: false,
    }, {
        $set: {
            hasInteracted: true,
            interactionStartedAt: new Date(),
        },
    }, { new: true });
    if (!updatedBooking) {
        return res.status(200).json({
            message: "Interaction already recorded",
            booking,
        });
    }
    return res.status(200).json({
        message: "Interaction recorded successfully",
        booking: updatedBooking,
    });
};
exports.markBookingInteracted = markBookingInteracted;
