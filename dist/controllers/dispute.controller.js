"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyDisputes = exports.getBookingDisputeState = exports.openDispute = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const dispute_model_1 = require("../models/dispute.model");
const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;
function participantRole(booking, userId) {
    if (String(booking.userId) === userId)
        return "USER";
    if (String(booking.creatorId) === userId)
        return "CREATOR";
    return null;
}
function disputeIneligibility(booking) {
    if (!["COMPLETED", "CANCELLED", "EXPIRED"].includes(booking.status))
        return "Dispute not allowed for this booking status";
    if (booking.status !== "COMPLETED")
        return null;
    if (!booking.completedAt)
        return "Invalid booking completion state";
    if (Date.now() - booking.completedAt.getTime() > DISPUTE_WINDOW_MS)
        return "Dispute window expired (24 hours)";
    return null;
}
function disputeDto(dispute, actorId, role) {
    const ownInput = role === "USER" ? dispute.customerInput : dispute.creatorInput;
    return {
        disputeId: String(dispute._id), bookingId: String(dispute.bookingId), status: dispute.status,
        raisedByMe: String(dispute.raisedBy) === actorId, raisedByRole: dispute.raisedByRole,
        reason: dispute.reason, escalationLevel: dispute.escalationLevel,
        createdAt: dispute.createdAt, updatedAt: dispute.updatedAt,
        resolution: dispute.resolution ? { action: dispute.resolution.action, resolvedAt: dispute.resolution.resolvedAt } : null,
        ...(dispute.finalDecision ? { finalDecision: { outcome: role === "USER" ? dispute.finalDecision.customerOutcome : dispute.finalDecision.creatorOutcome, summary: dispute.finalDecision.summary, financialReviewRequired: dispute.finalDecision.financialReviewRequired, governanceReviewRequired: dispute.finalDecision.governanceReviewRequired, finalizedAt: dispute.finalDecision.finalizedAt } } : {}),
        input: { state: ownInput?.state ?? "OPEN" },
    };
}
async function findParticipantBooking(bookingId, userId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId))
        return { booking: null, role: null };
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking)
        return { booking: null, role: null };
    return { booking, role: participantRole(booking, userId) };
}
const isDuplicateKeyError = (error) => typeof error === "object" && error !== null && "code" in error && error.code === 11000;
const openDispute = async (req, res) => {
    const user = req.user;
    const { bookingId, reason } = req.body;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    if (typeof bookingId !== "string" || typeof reason !== "string")
        return res.status(400).json({ message: "bookingId and reason are required" });
    const trimmedReason = reason.trim();
    if (!trimmedReason)
        return res.status(400).json({ message: "reason is required" });
    if (trimmedReason.length > 1000)
        return res.status(400).json({ message: "reason must be at most 1000 characters" });
    const { booking, role } = await findParticipantBooking(bookingId, user.id);
    if (!booking)
        return res.status(mongoose_1.default.Types.ObjectId.isValid(bookingId) ? 404 : 400).json({ message: mongoose_1.default.Types.ObjectId.isValid(bookingId) ? "Booking not found" : "Invalid bookingId" });
    if (!role)
        return res.status(403).json({ message: "Access denied" });
    const ineligibilityReason = disputeIneligibility(booking);
    if (ineligibilityReason)
        return res.status(400).json({ message: ineligibilityReason });
    if (await dispute_model_1.Dispute.exists({ bookingId: booking._id }))
        return res.status(409).json({ message: "A dispute already exists for this booking" });
    try {
        const dispute = await dispute_model_1.Dispute.create({ bookingId: booking._id, raisedBy: user.id, raisedByRole: role, reason: trimmedReason, status: "OPEN", customerInput: { state: "OPEN" }, creatorInput: { state: "OPEN" } });
        return res.status(201).json({ message: "Dispute opened successfully", dispute: disputeDto(dispute, user.id, role) });
    }
    catch (error) {
        if (isDuplicateKeyError(error))
            return res.status(409).json({ message: "A dispute already exists for this booking" });
        throw error;
    }
};
exports.openDispute = openDispute;
const getBookingDisputeState = async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    const { booking, role } = await findParticipantBooking(req.params.bookingId, user.id);
    if (!booking)
        return res.status(mongoose_1.default.Types.ObjectId.isValid(req.params.bookingId) ? 404 : 400).json({ message: mongoose_1.default.Types.ObjectId.isValid(req.params.bookingId) ? "Booking not found" : "Invalid bookingId" });
    if (!role)
        return res.status(403).json({ message: "Access denied" });
    const dispute = await dispute_model_1.Dispute.findOne({ bookingId: booking._id });
    const ineligibilityReason = dispute ? "A dispute already exists for this booking" : disputeIneligibility(booking);
    return res.status(200).json({ hasDispute: Boolean(dispute), canOpenDispute: !dispute && !ineligibilityReason, ineligibilityReason, dispute: dispute ? disputeDto(dispute, user.id, role) : null });
};
exports.getBookingDisputeState = getBookingDisputeState;
const getMyDisputes = async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    const bookings = await booking_model_1.Booking.find({ $or: [{ userId: user.id }, { creatorId: user.id }] }).select("_id userId creatorId bookingReference status serviceTitle").lean();
    const bookingById = new Map(bookings.map((booking) => [String(booking._id), booking]));
    const disputes = await dispute_model_1.Dispute.find({ bookingId: { $in: bookings.map((booking) => booking._id) } }).sort({ createdAt: -1 });
    return res.status(200).json({ disputes: disputes.map((dispute) => {
            const booking = bookingById.get(String(dispute.bookingId));
            const role = String(booking?.userId) === user.id ? "USER" : "CREATOR";
            return { ...disputeDto(dispute, user.id, role), booking: booking ? { bookingId: String(booking._id), bookingReference: booking.bookingReference, status: booking.status, serviceTitle: booking.serviceTitle } : null };
        }) });
};
exports.getMyDisputes = getMyDisputes;
