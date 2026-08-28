"use strict";
//backend/src/controllers/admin.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideAppeal = exports.getAuditLogs = exports.getEscalatedDisputes = exports.resolveDispute = exports.adminCancelBooking = exports.rejectCreator = exports.approveCreator = exports.resetUserTrust = exports.banUser = exports.activateUser = exports.suspendUser = void 0;
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const creatorStatus_1 = require("../constants/creatorStatus");
const roles_1 = require("../constants/roles");
const AppError_1 = require("../utils/AppError");
const booking_model_1 = require("../models/booking.model");
const dispute_model_1 = require("../models/dispute.model");
const appeal_model_1 = require("../models/appeal.model");
const auditLog_service_1 = require("../services/auditLog.service");
const disputeLock_service_1 = require("../services/disputeLock.service");
const suspensionLifecycle_service_1 = require("../services/accountGovernance/suspensionLifecycle.service");
const unsuspendLifecycle_service_1 = require("../services/accountGovernance/unsuspendLifecycle.service");
const banLifecycle_service_1 = require("../services/accountGovernance/banLifecycle.service");
const cooldownLifecycle_service_1 = require("../services/accountGovernance/cooldownLifecycle.service");
const userTrustAuditSnapshot_dto_1 = require("../dtos/admin/userTrustAuditSnapshot.dto");
/* ==================== HELPERS ==================== */
const preventSelfAction = (adminId, targetUserId) => adminId === targetUserId;
const requiredGovernanceReason = (value) => {
    if (typeof value !== "string" || !value.trim()) {
        throw new AppError_1.AppError("A governance reason is required", 400);
    }
    return value.trim();
};
/* ==================== USER STATUS ==================== */
const suspendUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot suspend themselves" });
    }
    const result = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({
        adminId,
        userId,
        reason: requiredGovernanceReason(req.body?.reason),
    });
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_SUSPENDED",
        entityType: "USER",
        entityId: result.userId,
        before: { governanceState: result.previousGovernanceState },
        after: {
            governanceState: result.governanceState,
            status: result.status,
            reason: result.reason,
            triggeredAt: result.triggeredAt,
            consequences: {
                terminatedCount: result.consequences.terminatedCount,
                protectedCount: result.consequences.protectedCount,
                disputeLockedCount: result.consequences.disputeLockedCount,
                financialLockedCount: result.consequences.financialLockedCount,
                failedCount: result.consequences.failedCount,
            },
        },
    });
    res.json({ message: "User suspended", ...result });
};
exports.suspendUser = suspendUser;
const activateUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot activate themselves" });
    }
    const result = await (0, unsuspendLifecycle_service_1.removeSuspensionLifecycle)({
        adminId,
        userId,
        reason: requiredGovernanceReason(req.body?.reason),
    });
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_ACTIVATED",
        entityType: "USER",
        entityId: result.userId,
        before: { governanceState: result.previousGovernanceState },
        after: {
            governanceState: result.governanceState,
            status: "active",
            effectiveCondition: result.effectiveCondition,
        },
    });
    res.json({ message: "User activated", ...result, status: "active" });
};
exports.activateUser = activateUser;
const banUser = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        return res.status(400).json({ message: "Admin cannot ban themselves" });
    }
    const result = await (0, banLifecycle_service_1.triggerBanLifecycle)({
        adminId,
        userId,
        reason: requiredGovernanceReason(req.body?.reason),
    });
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_BANNED",
        entityType: "USER",
        entityId: result.userId,
        before: { governanceState: result.previousGovernanceState },
        after: {
            governanceState: result.governanceState,
            status: result.status,
            reason: result.reason,
            triggeredAt: result.triggeredAt,
            consequences: {
                terminatedCount: result.consequences.terminatedCount,
                protectedCount: result.consequences.protectedCount,
                disputeLockedCount: result.consequences.disputeLockedCount,
                financialLockedCount: result.consequences.financialLockedCount,
                failedCount: result.consequences.failedCount,
            },
        },
    });
    res.json({ message: "User banned", ...result });
};
exports.banUser = banUser;
/* ================= TRUST RESET ================= */
const resetUserTrust = async (req, res) => {
    const adminId = req.user.id;
    const userId = req.params.id;
    if (preventSelfAction(adminId, userId)) {
        throw new AppError_1.AppError("Admin cannot reset own trust", 400);
    }
    const beforeUser = await User_1.default.findById(userId)
        .select("abuseScore status governanceState userCooldownUntil creatorCooldownUntil")
        .lean();
    if (!beforeUser) {
        throw new AppError_1.AppError("User not found", 404);
    }
    const user = await (0, cooldownLifecycle_service_1.resetAccountTrust)(userId);
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(adminId),
        action: "USER_TRUST_RESET",
        entityType: "USER",
        entityId: user._id,
        before: (0, userTrustAuditSnapshot_dto_1.toUserTrustAuditSnapshot)(beforeUser),
        after: (0, userTrustAuditSnapshot_dto_1.toUserTrustAuditSnapshot)(user),
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
    const result = await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
        bookingId,
        actorId: adminId,
        actorType: bookingTerminationType_enum_1.BookingTerminationActorType.ADMIN,
        terminationType: bookingTerminationType_enum_1.BookingTerminationType.ADMIN_CANCELLED,
        reason: typeof req.body.reason === "string" ? req.body.reason : undefined,
    });
    return res.json({ message: "Booking cancelled by admin", ...result });
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
        if (action !== "NO_ACTION") {
            throw new AppError_1.AppError("Dispute financial outcomes are deferred to the Financial termination and refund-accounting phases", 409);
        }
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
    const result = await (0, auditLog_service_1.queryAuditLogs)(req.query);
    res.json({
        logs: result.logs.map((log) => ({
            auditReference: log._id.toString(), category: log.category, action: log.action, entityType: log.entityType, entityId: log.entityId.toString(),
            actor: { type: log.actorType, id: log.actorId?.toString(), reference: log.actorReference },
            financialContext: log.financialContext, transition: log.transition,
            metadata: log.metadata, createdAt: log.createdAt,
        })),
        pagination: result.pagination,
    });
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
        if (action === "REVERSE_DECISION" && dispute.resolution?.action !== "NO_ACTION") {
            throw new AppError_1.AppError("Financial dispute reversal is deferred to later Financial Domain phases", 409);
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
