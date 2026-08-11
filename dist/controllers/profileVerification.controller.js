"use strict";
// backend/src/controllers/profileVerification.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectProfile = exports.approveProfile = exports.listPendingProfiles = void 0;
const userProfile_model_1 = require("../models/userProfile.model");
const walletCreation_service_1 = require("../services/wallet/walletCreation.service");
const AppError_1 = require("../utils/AppError");
/* ================= LIST PENDING PROFILES ================= */
const listPendingProfiles = async (_req, res) => {
    const profiles = await userProfile_model_1.UserProfile.find({
        profileStatus: "pending_verification",
    })
        .populate("userId", "name email")
        .sort({
        verificationSubmittedAt: -1,
        createdAt: -1,
    })
        .lean();
    res.json({ profiles });
};
exports.listPendingProfiles = listPendingProfiles;
/* ================= APPROVE PROFILE ================= */
const approveProfile = async (req, res) => {
    const { profileId } = req.params;
    const profile = await userProfile_model_1.UserProfile.findById(profileId);
    if (!profile) {
        throw new AppError_1.AppError("Profile not found", 404);
    }
    if (profile.profileStatus !== "pending_verification") {
        throw new AppError_1.AppError("Profile not eligible for approval", 400);
    }
    profile.profileStatus = "verified";
    profile.rejectionReason = "";
    await profile.save();
    /**
     * ============================================================
     * Financial Domain
     * Wallet Initialization
     * ============================================================
     *
     * A verified user receives the default INR Wallet currency bucket.
     * Wallet creation is idempotent.
     */
    await walletCreation_service_1.walletCreationService.createWallet(profile.userId);
    res.json({
        message: "Profile verified successfully",
    });
};
exports.approveProfile = approveProfile;
/* ================= REJECT PROFILE ================= */
const rejectProfile = async (req, res) => {
    const { profileId } = req.params;
    const { reason } = req.body;
    const profile = await userProfile_model_1.UserProfile.findById(profileId);
    if (!profile) {
        throw new AppError_1.AppError("Profile not found", 404);
    }
    if (profile.profileStatus !== "pending_verification") {
        throw new AppError_1.AppError("Profile not eligible for rejection", 400);
    }
    if (!reason || !reason.trim()) {
        throw new AppError_1.AppError("Rejection reason is required", 400);
    }
    profile.profileStatus = "rejected";
    profile.rejectionReason = reason.trim();
    await profile.save();
    res.json({
        message: "Profile rejected",
    });
};
exports.rejectProfile = rejectProfile;
