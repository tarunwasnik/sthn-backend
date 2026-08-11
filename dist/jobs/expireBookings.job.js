"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireBookingsJob = void 0;
const booking_model_1 = require("../models/booking.model");
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
/** The scheduled expiry caller owns discovery only; Financial termination owns execution. */
const expireBookingsJob = async () => {
    const expiredBookings = await booking_model_1.Booking.find({
        status: "REQUESTED",
        expiresAt: { $lte: new Date() },
    }).select("_id");
    for (const booking of expiredBookings) {
        await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
            bookingId: booking._id.toString(),
            actorType: bookingTerminationType_enum_1.BookingTerminationActorType.SYSTEM,
            terminationType: bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED,
            reason: "Booking request expired.",
        });
    }
};
exports.expireBookingsJob = expireBookingsJob;
