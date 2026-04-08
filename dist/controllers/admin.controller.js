"use strict";
//backend/src/controllers/admin.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideAppeal = exports.getAuditLogs = exports.getEscalatedDisputes = exports.resolveDispute = exports.adminCancelBooking = exports.rejectCreator = exports.approveCreator = exports.resetUserTrust = exports.banUser = exports.activateUser = exports.suspendUser = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const creatorStatus_1 = require("../constants/creatorStatus");
const roles_1 = require("../constants/roles");
const AppError_1 = require("../utils/AppError");
const booking_model_1 = require("../models/booking.model");
const slot_model_1 = require("../models/slot.model");
const dispute_model_1 = require("../models/dispute.model");
const auditLog_model_1 = require("../models/auditLog.model");
const appeal_model_1 = require("../models/appeal.model");
const auditLog_service_1 = require("../services/auditLog.service");
const disputeLock_service_1 = require("../services/disputeLock.service");
/* ==================== HELPERS ==================== */
const preventSelfAction = (adminId, targetUserId) => adminId === targetUserId;
/* ==================== USER STATUS ==================== */
const suspendUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot suspend themselves" });
    }
    const before = (await User_1.default.findById(userId).lean()) ?? undefined;
    const user = await User_1.default.findByIdAndUpdate(userId, { status: "suspended" }, { new: true });
    if (!user)
        throw new AppError_1.AppError("User not found", 404);
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_SUSPENDED",
        entityType: "USER",
        entityId: user._id,
        before,
        after: { status: user.status },
    });
    res.json({ message: "User suspended", status: user.status });
};
exports.suspendUser = suspendUser;
const activateUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot activate themselves" });
    }
    const before = (await User_1.default.findById(userId).lean()) ?? undefined;
    const user = await User_1.default.findByIdAndUpdate(userId, { status: "active" }, { new: true });
    if (!user)
        throw new AppError_1.AppError("User not found", 404);
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_ACTIVATED",
        entityType: "USER",
        entityId: user._id,
        before,
        after: { status: user.status },
    });
    res.json({ message: "User activated", status: user.status });
};
exports.activateUser = activateUser;
const banUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot ban themselves" });
    }
    const before = (await User_1.default.findById(userId).lean()) ?? undefined;
    const user = await User_1.default.findByIdAndUpdate(userId, { status: "banned" }, { new: true });
    if (!user)
        throw new AppError_1.AppError("User not found", 404);
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_BANNED",
        entityType: "USER",
        entityId: user._id,
        before,
        after: { status: user.status },
    });
    res.json({ message: "User banned", status: user.status });
};
exports.banUser = banUser;
/* ================= TRUST RESET ================= */
const resetUserTrust = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        throw new AppError_1.AppError("Admin cannot reset own trust", 400);
    }
    const before = (await User_1.default.findById(userId).lean()) ?? undefined;
    const user = await User_1.default.findByIdAndUpdate(userId, {
        abuseScore: 0,
        userCooldownUntil: null,
        creatorCooldownUntil: null,
        status: "active",
    }, { new: true });
    if (!user)
        throw new AppError_1.AppError("User not found", 404);
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_TRUST_RESET",
        entityType: "USER",
        entityId: user._id,
        before,
        after: {
            abuseScore: user.abuseScore,
            status: user.status,
        },
    });
    res.json({ message: "User trust reset successfully" });
};
exports.resetUserTrust = resetUserTrust;
/* ================= CREATOR MANUAL APPROVAL ================= */
const approveCreator = async (req, res) => {
    const adminId = req.user.id;
    const { creatorProfileId } = req.params;
    const profile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!profile)
        throw new AppError_1.AppError("Creator profile not found", 404);
    const before = profile.toObject();
    profile.status = creatorStatus_1.CREATOR_STATUS.ACTIVE;
    await profile.save();
    // 🔁 Sync identity state
    await User_1.default.findByIdAndUpdate(profile.userId, {
        role: roles_1.ROLES.CREATOR,
        creatorStatus: "approved",
    });
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "CREATOR_APPROVED",
        entityType: "CREATOR_PROFILE",
        entityId: profile._id,
        before,
        after: { status: profile.status },
    });
    res.json({ message: "Creator approved successfully" });
};
exports.approveCreator = approveCreator;
const rejectCreator = async (req, res) => {
    const adminId = req.user.id;
    const { creatorProfileId } = req.params;
    const profile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!profile)
        throw new AppError_1.AppError("Creator profile not found", 404);
    const before = profile.toObject();
    profile.status = creatorStatus_1.CREATOR_STATUS.DEACTIVATED;
    await profile.save();
    // 🔁 Sync identity state
    await User_1.default.findByIdAndUpdate(profile.userId, {
        creatorStatus: "rejected",
    });
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "CREATOR_REJECTED",
        entityType: "CREATOR_PROFILE",
        entityId: profile._id,
        before,
        after: { status: profile.status },
    });
    res.json({ message: "Creator application rejected" });
};
exports.rejectCreator = rejectCreator;
/* ================= ADMIN BOOKING CONTROL ================= */
const adminCancelBooking = async (req, res) => {
    const adminId = req.user.id;
    const { bookingId } = req.params;
    const { refund } = req.body;
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const booking = await booking_model_1.Booking.findById(bookingId).session(session);
        if (!booking)
            throw new AppError_1.AppError("Booking not found", 404);
        const before = booking.toObject();
        booking.status = "CANCELLED";
        booking.paymentStatus = refund ? "REFUNDED" : "PAID";
        await booking.save({ session });
        await slot_model_1.Slot.updateMany({ _id: { $in: booking.slotIds } }, { status: "AVAILABLE" }, { session });
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "ADMIN",
            actorId: new mongoose_1.default.Types.ObjectId(adminId),
            action: "BOOKING_CANCELLED_BY_ADMIN",
            entityType: "BOOKING",
            entityId: booking._id,
            before,
            after: {
                status: booking.status,
                paymentStatus: booking.paymentStatus,
            },
        });
        await session.commitTransaction();
        res.json({ message: "Booking cancelled by admin" });
    }
    catch (err) {
        await session.abortTransaction();
        throw err;
    }
    finally {
        session.endSession();
    }
};
exports.adminCancelBooking = adminCancelBooking;
/* ================= DISPUTE RESOLUTION (LOCKED) ================= */
const resolveDispute = async (req, res) => {
    const adminId = req.user.id;
    const { disputeId } = req.params;
    const { action, note } = req.body;
    if (!["REFUND_USER", "PAY_CREATOR", "NO_ACTION"].includes(action)) {
        throw new AppError_1.AppError("Invalid resolution action", 400);
    }
    await (0, disputeLock_service_1.assertDisputeMutable)(disputeId);
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const dispute = await dispute_model_1.Dispute.findById(disputeId).session(session);
        if (!dispute || dispute.status !== "OPEN") {
            throw new AppError_1.AppError("Dispute not found or already resolved", 404);
        }
        const before = dispute.toObject();
        const booking = await booking_model_1.Booking.findById(dispute.bookingId).session(session);
        if (!booking)
            throw new AppError_1.AppError("Booking not found", 404);
        if (action === "REFUND_USER")
            booking.paymentStatus = "REFUNDED";
        if (action === "PAY_CREATOR")
            booking.paymentStatus = "PAID";
        dispute.status = action === "NO_ACTION" ? "REJECTED" : "RESOLVED";
        dispute.resolution = {
            action,
            note,
            resolvedBy: new mongoose_1.default.Types.ObjectId(adminId),
            resolvedAt: new Date(),
        };
        await booking.save({ session });
        await dispute.save({ session });
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "ADMIN",
            actorId: new mongoose_1.default.Types.ObjectId(adminId),
            action: "DISPUTE_RESOLVED",
            entityType: "DISPUTE",
            entityId: dispute._id,
            before,
            after: dispute.resolution,
        });
        await session.commitTransaction();
        res.json({ message: "Dispute resolved successfully" });
    }
    catch (err) {
        await session.abortTransaction();
        throw err;
    }
    finally {
        session.endSession();
    }
};
exports.resolveDispute = resolveDispute;
/* ================= ESCALATED DISPUTES ================= */
const getEscalatedDisputes = async (req, res) => {
    const { level } = req.query;
    const query = {
        status: "OPEN",
        escalationLevel: { $ne: "NONE" },
    };
    if (level)
        query.escalationLevel = level;
    const disputes = await dispute_model_1.Dispute.find(query)
        .sort({ escalatedAt: -1 })
        .lean();
    res.json({ disputes });
};
exports.getEscalatedDisputes = getEscalatedDisputes;
/* ================= AUDIT LOG VIEW ================= */
const getAuditLogs = async (req, res) => {
    const logs = await auditLog_model_1.AuditLog.find().sort({ createdAt: -1 }).lean();
    res.json({ logs });
};
exports.getAuditLogs = getAuditLogs;
/* ================= APPEAL DECISION ================= */
const decideAppeal = async (req, res) => {
    const adminId = req.user.id;
    const { appealId } = req.params;
    const { action, note } = req.body;
    if (!["REVERSE_DECISION", "CONFIRM_DECISION"].includes(action)) {
        throw new AppError_1.AppError("Invalid appeal decision action", 400);
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const appeal = await appeal_model_1.Appeal.findById(appealId).session(session);
        if (!appeal || appeal.status !== "OPEN") {
            throw new AppError_1.AppError("Appeal not found or already decided", 404);
        }
        const dispute = await dispute_model_1.Dispute.findById(appeal.disputeId).session(session);
        if (!dispute)
            throw new AppError_1.AppError("Linked dispute not found", 404);
        const booking = await booking_model_1.Booking.findById(dispute.bookingId).session(session);
        if (!booking)
            throw new AppError_1.AppError("Linked booking not found", 404);
        const beforeAppeal = appeal.toObject();
        const beforeDispute = dispute.toObject();
        if (action === "REVERSE_DECISION") {
            if (dispute.resolution?.action === "REFUND_USER") {
                booking.paymentStatus = "PAID";
            }
            if (dispute.resolution?.action === "PAY_CREATOR") {
                booking.paymentStatus = "REFUNDED";
            }
        }
        appeal.status = action === "REVERSE_DECISION" ? "UPHELD" : "REJECTED";
        appeal.decision = {
            action,
            note,
            decidedBy: new mongoose_1.default.Types.ObjectId(adminId),
            decidedAt: new Date(),
        };
        await booking.save({ session });
        await appeal.save({ session });
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "ADMIN",
            actorId: new mongoose_1.default.Types.ObjectId(adminId),
            action: "APPEAL_DECIDED",
            entityType: "APPEAL",
            entityId: appeal._id,
            before: beforeAppeal,
            after: appeal.decision,
        });
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "ADMIN",
            actorId: new mongoose_1.default.Types.ObjectId(adminId),
            action: "DISPUTE_APPEAL_OUTCOME_APPLIED",
            entityType: "DISPUTE",
            entityId: dispute._id,
            before: beforeDispute,
            after: { paymentStatus: booking.paymentStatus },
        });
        await session.commitTransaction();
        res.json({ message: "Appeal decided successfully" });
    }
    catch (err) {
        await session.abortTransaction();
        throw err;
    }
    finally {
        session.endSession();
    }
};
exports.decideAppeal = decideAppeal;
