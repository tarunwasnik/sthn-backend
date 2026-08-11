"use strict";
// backend/src/controllers/creatorBookingDecision.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideBooking = exports.getCreatorBookings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const userProfile_model_1 = require("../models/userProfile.model");
const creatorStatus_1 = require("../constants/creatorStatus");
const creatorService_model_1 = require("../models/creatorService.model");
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
const User_1 = __importDefault(require("../models/User"));
const accountGovernanceResolver_service_1 = require("../services/accountGovernance/accountGovernanceResolver.service");
/* =========================================================
   GET CREATOR BOOKINGS (EXTENDED WITH USER + SLOTS)
========================================================= */
const getCreatorBookings = async (req, res) => {
    const user = req.user;
    const { status } = req.query;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
            userId: user.id,
        });
        if (!creatorProfile) {
            return res.status(403).json({
                message: "Creator profile not found",
            });
        }
        if (creatorProfile.status !== creatorStatus_1.CREATOR_STATUS.ACTIVE) {
            return res.status(403).json({
                message: "Creator profile is not active",
            });
        }
        /* ================= FILTER ================= */
        const filter = {
            creatorId: user.id,
        };
        if (status && status !== "ALL") {
            filter.status = status;
        }
        /* ================= BASE FETCH ================= */
        const bookings = await booking_model_1.Booking.find(filter)
            .sort({ createdAt: -1 })
            .lean();
        /* ================= USER ENRICH ================= */
        const userIds = [
            ...new Set(bookings.map((b) => String(b.userId))),
        ];
        const userProfiles = await userProfile_model_1.UserProfile.find({
            userId: { $in: userIds },
        }).lean();
        const userMap = new Map(userProfiles.map((u) => [
            String(u.userId),
            u,
        ]));
        /* ================= SLOT ENRICH ================= */
        const allSlotIds = bookings.flatMap((b) => b.slotIds || []);
        const slots = await slot_model_1.Slot.find({
            _id: { $in: allSlotIds },
        }).lean();
        const slotMap = new Map(slots.map((s) => [String(s._id), s]));
        /* ================= SERVICE ENRICH ================= */
        const serviceIds = [
            ...new Set(bookings
                .map((b) => String(b.serviceId))
                .filter(Boolean)),
        ];
        const services = await creatorService_model_1.CreatorService.find({
            _id: { $in: serviceIds },
        }).lean();
        const serviceMap = new Map(services.map((s) => [
            String(s._id),
            s,
        ]));
        /* ================= FINAL MERGE ================= */
        const enrichedBookings = bookings.map((b) => {
            const profile = userMap.get(String(b.userId));
            const service = serviceMap.get(String(b.serviceId));
            return {
                ...b,
                service: {
                    _id: service?._id || null,
                    title: service?.title || "Untitled",
                    media: service?.media || [],
                },
                user: {
                    _id: String(b.userId),
                    displayName: profile?.username || "Unknown",
                    avatarUrl: profile?.profilePhotos?.[0] || null,
                },
                slots: (b.slotIds || [])
                    .map((id) => slotMap.get(String(id)))
                    .filter(Boolean),
            };
        });
        return res.status(200).json({
            bookings: enrichedBookings,
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Failed to fetch bookings",
        });
    }
};
exports.getCreatorBookings = getCreatorBookings;
/* =========================================================
   DECIDE BOOKING (UNCHANGED)
========================================================= */
const decideBooking = async (req, res) => {
    const user = req.user;
    const bookingId = req.params.bookingId ?? req.body.bookingId;
    let { decision } = req.body;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!bookingId) {
        return res.status(400).json({
            message: "bookingId is required",
        });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    decision = String(decision).toUpperCase();
    if (!["ACCEPT", "REJECT"].includes(decision)) {
        return res.status(400).json({
            message: "decision must be ACCEPT or REJECT",
        });
    }
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
        userId: user.id,
    });
    if (!creatorProfile) {
        return res.status(403).json({
            message: "Creator profile not found",
        });
    }
    if (creatorProfile.status !== creatorStatus_1.CREATOR_STATUS.ACTIVE) {
        return res.status(403).json({
            message: "Creator profile is not active",
        });
    }
    if (decision === "REJECT") {
        try {
            const result = await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
                bookingId,
                actorId: user.id,
                actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR,
                terminationType: bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED,
            });
            return res.status(200).json({ message: "Booking rejected successfully", ...result });
        }
        catch (error) {
            return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
        }
    }
    const creatorUser = await User_1.default.findById(user.id);
    if (!creatorUser) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }
    const creatorGovernance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(creatorUser);
    if (creatorGovernance.blocksAcceptingBookings) {
        return res.status(403).json({
            message: "Your account is currently restricted from accepting booking requests.",
            ...(creatorGovernance.isCreatorCooldownActive &&
                creatorGovernance.cooldownUntil
                ? {
                    cooldownUntil: creatorGovernance.cooldownUntil,
                }
                : {}),
        });
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const booking = await booking_model_1.Booking.findOne({
            _id: bookingId,
            creatorId: user.id,
            status: "REQUESTED",
        }).session(session);
        if (!booking) {
            throw new Error("Booking not found or already processed");
        }
        if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
            throw new Error("Booking request has expired");
        }
        const slots = await slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }, null, { session });
        if (slots.length !== booking.slotIds.length) {
            throw new Error("One or more slots no longer exist");
        }
        const invalidOwner = slots.some((slot) => String(slot.creatorId) !== String(booking.creatorId));
        if (invalidOwner) {
            throw new Error("Slot ownership mismatch");
        }
        if (decision === "ACCEPT") {
            const hasNonLocked = slots.some((slot) => slot.status !== "LOCKED");
            if (hasNonLocked) {
                throw new Error("One or more slots are no longer locked");
            }
            const slotUpdate = await slot_model_1.Slot.updateMany({
                _id: { $in: booking.slotIds },
                status: "LOCKED",
            }, { status: "BOOKED" }, { session });
            if (slotUpdate.modifiedCount !== booking.slotIds.length) {
                throw new Error("Failed to book all slots");
            }
            booking.status = "CONFIRMED";
        }
        else {
            throw new Error("Creator rejection must be processed by the Financial termination service.");
        }
        await booking.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            message: `Booking ${decision.toLowerCase()} successfully`,
            booking,
        });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
            message: err.message || "Failed to process booking decision",
        });
    }
};
exports.decideBooking = decideBooking;
