"use strict";
// backend/src/controllers/creatorAvailability.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableSlotsForCreator = exports.deleteSlot = exports.enableSlot = exports.disableSlot = exports.getAvailabilitySlots = exports.getCreatorAvailabilities = exports.cancelAvailability = exports.createAvailability = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const availability_model_1 = require("../models/availability.model");
const creatorService_model_1 = require("../models/creatorService.model");
const slotGenerator_service_1 = require("../services/slotGenerator.service");
const slot_model_1 = require("../models/slot.model");
/* =========================================================
   CREATE AVAILABILITY
========================================================= */
const createAvailability = async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const { serviceId, date, startTime, endTime, slotDurationMinutes } = req.body;
    if (!serviceId || !date || !startTime || !endTime) {
        return res.status(400).json({
            message: "serviceId, date, startTime and endTime are required",
        });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        return res.status(400).json({
            message: "Invalid serviceId",
        });
    }
    const service = await creatorService_model_1.CreatorService.findOne({
        _id: serviceId,
        creatorId: new mongoose_1.default.Types.ObjectId(user.id),
        isActive: true,
    });
    if (!service) {
        return res.status(404).json({
            message: "Service not found or inactive",
        });
    }
    if (startTime >= endTime) {
        return res.status(400).json({
            message: "startTime must be before endTime",
        });
    }
    const [year, month, day] = date.split("-").map(Number);
    const availabilityDate = new Date(Date.UTC(year, month - 1, day));
    const toMinutes = (time) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
    };
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);
    const existingAvailabilities = await availability_model_1.Availability.find({
        creatorId: user.id,
        date: availabilityDate,
        status: "ACTIVE",
    });
    for (const existing of existingAvailabilities) {
        const existingStart = toMinutes(existing.startTime);
        const existingEnd = toMinutes(existing.endTime);
        const overlaps = newStart < existingEnd && newEnd > existingStart;
        if (overlaps) {
            return res.status(400).json({
                message: "Availability overlaps with an existing active window",
            });
        }
    }
    const availability = await availability_model_1.Availability.create({
        creatorId: user.id,
        serviceId,
        date: availabilityDate,
        startTime,
        endTime,
        slotDurationMinutes: slotDurationMinutes || service.durationMinutes,
        status: "ACTIVE",
    });
    await (0, slotGenerator_service_1.generateSlotsForAvailability)({
        availabilityId: availability._id,
        creatorId: new mongoose_1.default.Types.ObjectId(user.id),
        serviceId: service._id,
        date: availabilityDate,
        startTime,
        endTime,
        slotDurationMinutes: availability.slotDurationMinutes,
        price: service.price,
    });
    return res.status(201).json({
        message: "Availability created successfully",
        availability,
    });
};
exports.createAvailability = createAvailability;
/* =========================================================
   CANCEL AVAILABILITY
========================================================= */
const cancelAvailability = async (req, res) => {
    const user = req.user;
    const { availabilityId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(availabilityId)) {
        return res.status(400).json({
            message: "Invalid availabilityId",
        });
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const availability = await availability_model_1.Availability.findOne({
            _id: availabilityId,
            creatorId: user.id,
            status: "ACTIVE",
        }).session(session);
        if (!availability) {
            throw new Error("Availability not found or already cancelled");
        }
        await slot_model_1.Slot.updateMany({
            availabilityId: availability._id,
            status: "AVAILABLE",
        }, { status: "CANCELLED" }, { session });
        availability.status = "CANCELLED";
        await availability.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            message: "Availability cancelled successfully",
            availability,
        });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
            message: err.message || "Failed to cancel availability",
        });
    }
};
exports.cancelAvailability = cancelAvailability;
/* =========================================================
   GET CREATOR AVAILABILITIES (DASHBOARD)
========================================================= */
const getCreatorAvailabilities = async (req, res) => {
    const user = req.user;
    const { includeCancelled } = req.query;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const matchFilter = {
        creatorId: new mongoose_1.default.Types.ObjectId(user.id),
    };
    if (includeCancelled !== "true") {
        matchFilter.status = "ACTIVE";
    }
    const availabilities = await availability_model_1.Availability.aggregate([
        { $match: matchFilter },
        {
            $lookup: {
                from: "slots",
                localField: "_id",
                foreignField: "availabilityId",
                as: "slots",
            },
        },
        {
            $addFields: {
                totalSlots: { $size: "$slots" },
                availableSlots: {
                    $size: {
                        $filter: {
                            input: "$slots",
                            as: "slot",
                            cond: { $eq: ["$$slot.status", "AVAILABLE"] },
                        },
                    },
                },
                lockedSlots: {
                    $size: {
                        $filter: {
                            input: "$slots",
                            as: "slot",
                            cond: { $eq: ["$$slot.status", "LOCKED"] },
                        },
                    },
                },
                bookedSlots: {
                    $size: {
                        $filter: {
                            input: "$slots",
                            as: "slot",
                            cond: { $eq: ["$$slot.status", "BOOKED"] },
                        },
                    },
                },
                cancelledSlots: {
                    $size: {
                        $filter: {
                            input: "$slots",
                            as: "slot",
                            cond: { $eq: ["$$slot.status", "CANCELLED"] },
                        },
                    },
                },
            },
        },
        { $project: { slots: 0 } },
        { $sort: { date: -1 } },
    ]);
    return res.status(200).json({
        count: availabilities.length,
        availabilities,
    });
};
exports.getCreatorAvailabilities = getCreatorAvailabilities;
/* =========================================================
   GET SLOTS FOR AN AVAILABILITY (CREATOR PANEL)
========================================================= */
const getAvailabilitySlots = async (req, res) => {
    const { availabilityId } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(availabilityId)) {
        return res.status(400).json({
            message: "Invalid availabilityId",
        });
    }
    const slots = await slot_model_1.Slot.find({
        availabilityId,
    }).sort({ startTime: 1 });
    return res.status(200).json({
        count: slots.length,
        slots,
    });
};
exports.getAvailabilitySlots = getAvailabilitySlots;
/* =========================================================
   DISABLE SLOT
========================================================= */
const disableSlot = async (req, res) => {
    const { slotId } = req.params;
    const slot = await slot_model_1.Slot.findByIdAndUpdate(slotId, { status: "CANCELLED" }, { new: true });
    if (!slot) {
        return res.status(404).json({
            message: "Slot not found",
        });
    }
    return res.json({
        message: "Slot disabled",
        slot,
    });
};
exports.disableSlot = disableSlot;
/* =========================================================
   ENABLE SLOT
========================================================= */
const enableSlot = async (req, res) => {
    const { slotId } = req.params;
    const slot = await slot_model_1.Slot.findByIdAndUpdate(slotId, { status: "AVAILABLE" }, { new: true });
    if (!slot) {
        return res.status(404).json({
            message: "Slot not found",
        });
    }
    return res.json({
        message: "Slot enabled",
        slot,
    });
};
exports.enableSlot = enableSlot;
/* =========================================================
   DELETE SLOT
========================================================= */
const deleteSlot = async (req, res) => {
    const { slotId } = req.params;
    const slot = await slot_model_1.Slot.findByIdAndDelete(slotId);
    if (!slot) {
        return res.status(404).json({
            message: "Slot not found",
        });
    }
    return res.json({
        message: "Slot deleted",
    });
};
exports.deleteSlot = deleteSlot;
/* =========================================================
   GET AVAILABLE SLOTS FOR CREATOR (PUBLIC SAFE)
   ✅ FIXED HERE ONLY
========================================================= */
const getAvailableSlotsForCreator = async (req, res) => {
    const { creatorId } = req.params;
    const { date } = req.query;
    if (!creatorId || !date) {
        return res.status(400).json({
            message: "creatorId and date are required",
        });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(creatorId)) {
        return res.status(400).json({
            message: "Invalid creatorId",
        });
    }
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const slots = await slot_model_1.Slot.aggregate([
        {
            $match: {
                creatorId: new mongoose_1.default.Types.ObjectId(creatorId),
                status: "AVAILABLE",
                // ✅ FIX: use date instead of startTime
                date: {
                    $gte: selectedDate,
                    $lt: nextDate,
                },
            },
        },
        {
            $lookup: {
                from: "availabilities",
                localField: "availabilityId",
                foreignField: "_id",
                as: "availability",
            },
        },
        { $unwind: "$availability" },
        {
            $match: {
                "availability.status": "ACTIVE",
            },
        },
        {
            $sort: { startTime: 1 },
        },
    ]);
    return res.status(200).json({
        date,
        count: slots.length,
        slots,
    });
};
exports.getAvailableSlotsForCreator = getAvailableSlotsForCreator;
