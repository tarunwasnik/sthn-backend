"use strict";
// backend/src/controllers/completeBooking.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeBookingByUser = exports.completeBookingByCreator = void 0;
const completeBooking_service_1 = require("../services/booking/completeBooking.service");
/* =========================================================
   CREATOR COMPLETES BOOKING
   ========================================================= */
const completeBookingByCreator = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const booking = await (0, completeBooking_service_1.completeBookingService)({
            bookingId,
            creatorId: user.id,
            role: user.role,
        });
        return res.status(200).json({
            message: "Booking completed successfully",
            booking,
        });
    }
    catch (err) {
        return res.status(400).json({
            message: err.message || "Failed to complete booking",
        });
    }
};
exports.completeBookingByCreator = completeBookingByCreator;
/* =========================================================
   USER ENDS SESSION
   ========================================================= */
const completeBookingByUser = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const booking = await (0, completeBooking_service_1.completeBookingService)({
            bookingId,
            creatorId: user.id, // service will validate role
            role: user.role,
        });
        return res.status(200).json({
            message: "Session ended successfully",
            booking,
        });
    }
    catch (err) {
        return res.status(400).json({
            message: err.message || "Failed to end session",
        });
    }
};
exports.completeBookingByUser = completeBookingByUser;
