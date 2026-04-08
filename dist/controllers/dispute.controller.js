"use strict";
//backend/src/controllers/dispute.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyDisputes = exports.openDispute = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const dispute_model_1 = require("../models/dispute.model");
const booking_model_1 = require("../models/booking.model");
const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
/* ======================================================
   OPEN DISPUTE (USER / CREATOR)
   ====================================================== */
const openDispute = async (req, res) => {
    const user = req.user;
    const { bookingId, reason } = req.body;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!bookingId || !reason) {
        return res.status(400).json({
            message: "bookingId and reason are required",
        });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const isUser = String(booking.userId) === String(user.id);
    const isCreator = String(booking.creatorId) === String(user.id);
    if (!isUser && !isCreator) {
        return res.status(403).json({ message: "Access denied" });
    }
    if (!["COMPLETED", "CANCELLED", "EXPIRED"].includes(booking.status)) {
        return res.status(400).json({
            message: "Dispute not allowed for this booking status",
        });
    }
    /**
     * ✅ DISPUTE WINDOW CHECK (24 HOURS)
     */
    if (booking.status === "COMPLETED") {
        if (!booking.completedAt) {
            return res.status(400).json({
                message: "Invalid booking completion state",
            });
        }
        const now = Date.now();
        const completedTime = new Date(booking.completedAt).getTime();
        if (now - completedTime > DISPUTE_WINDOW_MS) {
            return res.status(400).json({
                message: "Dispute window expired (24 hours)",
            });
        }
    }
    const existing = await dispute_model_1.Dispute.findOne({
        bookingId: booking._id,
        status: "OPEN",
    });
    if (existing) {
        return res.status(400).json({
            message: "An open dispute already exists",
        });
    }
    const dispute = await dispute_model_1.Dispute.create({
        bookingId: booking._id,
        raisedBy: user.id,
        raisedByRole: isUser ? "USER" : "CREATOR",
        reason,
        status: "OPEN",
    });
    return res.status(201).json({
        message: "Dispute opened successfully",
        dispute,
    });
};
exports.openDispute = openDispute;
/* ======================================================
   GET MY DISPUTES (USER / CREATOR)
   ====================================================== */
const getMyDisputes = async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const disputes = await dispute_model_1.Dispute.find({
        raisedBy: user.id,
    })
        .populate("bookingId")
        .sort({ createdAt: -1 });
    return res.status(200).json({
        disputes,
    });
};
exports.getMyDisputes = getMyDisputes;
