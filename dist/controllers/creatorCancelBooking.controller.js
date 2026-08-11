"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBookingByCreator = void 0;
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
const cancelBookingByCreator = async (req, res) => {
    if (!req.user?.id)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        const result = await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
            bookingId: req.body.bookingId,
            actorId: req.user.id,
            actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR,
            terminationType: bookingTerminationType_enum_1.BookingTerminationType.CREATOR_CANCELLED,
            reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
        });
        return res.status(200).json({ message: "Booking cancelled by creator", ...result });
    }
    catch (error) {
        return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
    }
};
exports.cancelBookingByCreator = cancelBookingByCreator;
