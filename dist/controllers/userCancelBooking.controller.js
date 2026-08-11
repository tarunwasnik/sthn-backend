"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBookingByUser = void 0;
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
const cancelBookingByUser = async (req, res) => {
    const userId = req.user?.id;
    const bookingId = req.params.bookingId ?? req.body.bookingId;
    if (!userId)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        const result = await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
            bookingId,
            actorId: userId,
            actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CUSTOMER,
            terminationType: bookingTerminationType_enum_1.BookingTerminationType.CUSTOMER_CANCELLED,
            reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
        });
        return res.status(200).json({ message: "Booking cancelled", ...result });
    }
    catch (error) {
        return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
    }
};
exports.cancelBookingByUser = cancelBookingByUser;
