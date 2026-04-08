"use strict";
// backend/src/controllers/public/publicSlot.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCreatorSlots = void 0;
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const availability_model_1 = require("../../models/availability.model");
const slot_model_1 = require("../../models/slot.model");
const creatorService_model_1 = require("../../models/creatorService.model");
const getPublicCreatorSlots = async (req, res) => {
    try {
        const { slug } = req.params;
        const { date } = req.query;
        if (!slug) {
            return res.status(400).json({
                message: "Creator slug is required",
            });
        }
        if (!date) {
            return res.status(400).json({
                message: "Date query parameter is required",
            });
        }
        const creator = await creatorProfile_model_1.CreatorProfile.findOne({
            slug,
            status: "active",
        });
        if (!creator) {
            return res.status(404).json({
                message: "Creator not found",
            });
        }
        const [year, month, day] = date
            .split("-")
            .map(Number);
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        const availability = await availability_model_1.Availability.find({
            creatorId: creator.userId,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: "ACTIVE",
        });
        if (availability.length === 0) {
            return res.json({ slots: [] });
        }
        const availabilityIds = availability.map((a) => a._id);
        const slots = await slot_model_1.Slot.find({
            availabilityId: { $in: availabilityIds },
            status: "AVAILABLE",
        }).sort({ startTime: 1 });
        if (slots.length === 0) {
            return res.json({ slots: [] });
        }
        const serviceIds = [...new Set(slots.map((s) => s.serviceId.toString()))];
        const services = await creatorService_model_1.CreatorService.find({
            _id: { $in: serviceIds },
            isActive: true,
        }).lean();
        const serviceMap = new Map(services.map((s) => [s._id.toString(), s]));
        const formattedSlots = slots.map((slot) => {
            const service = serviceMap.get(slot.serviceId.toString());
            return {
                id: slot._id.toString(),
                serviceId: slot.serviceId,
                serviceTitle: service?.title || "",
                price: service?.price || slot.price,
                durationMinutes: service?.durationMinutes || null,
                startTime: slot.startTime,
                endTime: slot.endTime,
            };
        });
        return res.json({
            slots: formattedSlots,
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Failed to fetch slots",
        });
    }
};
exports.getPublicCreatorSlots = getPublicCreatorSlots;
