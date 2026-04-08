"use strict";
// backend/src/controllers/creatorBookingDetails.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreatorBookingDetails = void 0;
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const creatorService_model_1 = require("../models/creatorService.model");
const userProfile_model_1 = require("../models/userProfile.model");
const getCreatorBookingDetails = async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const booking = await booking_model_1.Booking.findOne({
            _id: id,
            creatorId: user.id,
        }).lean();
        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }
        const slots = await slot_model_1.Slot.find({
            _id: { $in: booking.slotIds },
        })
            .sort({ startTime: 1 })
            .lean();
        const userProfile = await userProfile_model_1.UserProfile.findOne({
            userId: booking.userId,
        }).lean();
        const service = await creatorService_model_1.CreatorService.findById(booking.serviceId).lean();
        return res.status(200).json({
            booking: {
                ...booking,
                slots,
                /* ✅ FIXED USER */
                user: {
                    _id: booking.userId,
                    displayName: userProfile?.username || "User",
                    avatarUrl: userProfile?.profilePhotos?.[0] || null,
                },
                service: {
                    _id: booking.serviceId,
                    title: booking.serviceTitle,
                    data: service || null,
                },
            },
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Failed to fetch booking",
        });
    }
};
exports.getCreatorBookingDetails = getCreatorBookingDetails;
