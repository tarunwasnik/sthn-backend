"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingFunding = exports.previewBookingFunding = void 0;
const bookingFundingRead_service_1 = require("../services/booking/bookingFundingRead.service");
const safeError = (error, fallback) => error instanceof Error ? error.message : fallback;
const previewBookingFunding = async (req, res) => {
    if (!req.user)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        const preview = await bookingFundingRead_service_1.bookingFundingReadService.preview({
            authenticatedUserId: req.user.id,
            serviceId: String(req.body.serviceId ?? ""),
            slotIds: Array.isArray(req.body.slotIds) ? req.body.slotIds.map(String) : [],
        });
        return res.status(200).json({ preview });
    }
    catch (error) {
        return res.status(400).json({ message: safeError(error, "Could not preview booking funding.") });
    }
};
exports.previewBookingFunding = previewBookingFunding;
const getBookingFunding = async (req, res) => {
    if (!req.user)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        const funding = await bookingFundingRead_service_1.bookingFundingReadService.getFunding({
            authenticatedUserId: req.user.id,
            bookingId: req.params.bookingId,
        });
        return res.status(200).json({ funding });
    }
    catch (error) {
        const message = safeError(error, "Could not read booking funding.");
        const status = message === "Booking not found" ? 404
            : message === "You are not allowed to view this booking funding." ? 403
                : 400;
        return res.status(status).json({ message });
    }
};
exports.getBookingFunding = getBookingFunding;
