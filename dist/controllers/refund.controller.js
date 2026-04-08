"use strict";
//backend/src/controllers/refund.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestRefund = void 0;
const booking_model_1 = require("../models/booking.model");
const interactionGuards_service_1 = require("../services/interactionGuards.service");
const requestRefund = async (req, res) => {
    const { bookingId } = req.params;
    if (!req.user)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        await (0, interactionGuards_service_1.assertRefundAllowed)(bookingId);
    }
    catch (err) {
        if (err instanceof interactionGuards_service_1.InteractionGuardError) {
            return res.status(403).json({ code: err.code, message: err.message });
        }
        throw err;
    }
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking)
        return res.status(404).json({ message: "Booking not found" });
    booking.paymentStatus = "REFUNDED";
    await booking.save();
    return res.status(200).json({ message: "Refund processed" });
};
exports.requestRefund = requestRefund;
