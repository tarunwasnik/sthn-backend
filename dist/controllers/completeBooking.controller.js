"use strict";
// backend/src/controllers/completeBooking.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeBookingByUser = exports.completeBookingByCreator = void 0;
const completeBooking_service_1 = require("../services/booking/completeBooking.service");
const BookingWalletReservationCaptureError_1 = require("../errors/financial/BookingWalletReservationCaptureError");
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
        const result = await (0, completeBooking_service_1.completeBookingService)({
            bookingId,
            creatorId: user.id,
            role: user.role,
        });
        return res.status(200).json({
            message: "Booking completed successfully",
            ...result,
        });
    }
    catch (err) {
        return res.status(err instanceof BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError ? err.statusCode : 400).json({
            ...(err instanceof BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError ? { code: err.code } : {}),
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
        const result = await (0, completeBooking_service_1.completeBookingService)({
            bookingId,
            creatorId: user.id, // service will validate role
            role: user.role,
        });
        return res.status(200).json({
            message: "Session ended successfully",
            ...result,
        });
    }
    catch (err) {
        return res.status(err instanceof BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError ? err.statusCode : 400).json({
            ...(err instanceof BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError ? { code: err.code } : {}),
            message: err.message || "Failed to end session",
        });
    }
};
exports.completeBookingByUser = completeBookingByUser;
