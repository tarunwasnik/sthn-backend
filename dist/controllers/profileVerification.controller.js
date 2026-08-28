"use strict";
// backend/src/controllers/profileVerification.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectProfile = exports.approveProfile = exports.listAdminReviewProfiles = exports.listPendingProfiles = void 0;
const AppError_1 = require("../utils/AppError");
const catchAsync_1 = require("../utils/catchAsync");
const profileVerificationRequest_service_1 = require("../services/profile/profileVerificationRequest.service");
/* ================= LIST PENDING PROFILES ================= */
exports.listPendingProfiles = (0, catchAsync_1.catchAsync)(async (_req, res) => {
    const profiles = await (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI");
    res.json({ profiles });
});
exports.listAdminReviewProfiles = (0, catchAsync_1.catchAsync)(async (_req, res) => {
    const profiles = await (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW");
    res.json({ profiles });
});
/* ================= APPROVE PROFILE ================= */
exports.approveProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { profileId } = req.params;
    const result = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({
        profileId,
        decision: "APPROVE",
        authority: "ADMIN",
        decidedBy: req.user.id,
    });
    res.json({
        message: "Profile verified successfully",
        replayed: result.replayed,
    });
});
/* ================= REJECT PROFILE ================= */
exports.rejectProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { profileId } = req.params;
    const { reason } = req.body;
    if (typeof reason !== "string")
        throw new AppError_1.AppError("Rejection reason is required", 400);
    const result = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({
        profileId,
        decision: "REJECT",
        authority: "ADMIN",
        decidedBy: req.user.id,
        reason,
    });
    res.json({
        message: "Profile rejected",
        replayed: result.replayed,
    });
});
