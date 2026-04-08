"use strict";
//backend/src/controllers/appeal.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.raiseAppeal = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const appeal_model_1 = require("../models/appeal.model");
const dispute_model_1 = require("../models/dispute.model");
const booking_model_1 = require("../models/booking.model");
/**
 * Raise an appeal (USER / CREATOR)
 * POST /appeals/:disputeId
 * Body: { reason: string, evidence?: string[] }
 */
const raiseAppeal = async (req, res) => {
    const user = req.user;
    const { disputeId } = req.params;
    const { reason, evidence = [] } = req.body;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId)) {
        return res.status(400).json({ message: "Invalid disputeId" });
    }
    if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Reason is required" });
    }
    const dispute = await dispute_model_1.Dispute.findById(disputeId);
    if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
    }
    // Only resolved/rejected disputes can be appealed
    if (!["RESOLVED", "REJECTED"].includes(dispute.status)) {
        return res.status(400).json({
            message: "Appeal allowed only after dispute is resolved or rejected",
        });
    }
    // Ensure no duplicate appeal exists
    const existing = await appeal_model_1.Appeal.findOne({ disputeId });
    if (existing) {
        return res.status(409).json({
            message: "An appeal has already been raised for this dispute",
        });
    }
    // Validate role & participation
    const booking = await booking_model_1.Booking.findById(dispute.bookingId);
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    const isUser = booking.userId.equals(actorId);
    const isCreator = booking.creatorId.equals(actorId);
    if (!isUser && !isCreator) {
        return res.status(403).json({ message: "Access denied" });
    }
    const appeal = await appeal_model_1.Appeal.create({
        disputeId,
        raisedBy: actorId,
        raisedByRole: isUser ? "USER" : "CREATOR",
        reason: reason.trim(),
        evidence,
        status: "OPEN",
    });
    res.status(201).json({
        message: "Appeal raised successfully",
        appeal,
    });
};
exports.raiseAppeal = raiseAppeal;
