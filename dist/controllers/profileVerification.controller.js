"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectProfile = exports.approveProfile = exports.listPendingProfiles = void 0;
const userProfile_model_1 = require("../models/userProfile.model");
const AppError_1 = require("../utils/AppError");
/* ================= LIST PENDING PROFILES ================= */
const listPendingProfiles = async (_req, res) => {
    const profiles = await userProfile_model_1.UserProfile.find({
        profileStatus: "pending_verification",
    })
        .populate("userId", "name email")
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
    await profile.save();
    res.json({
        message: "Profile verified successfully",
    });
};
exports.approveProfile = approveProfile;
/* ================= REJECT PROFILE ================= */
const rejectProfile = async (req, res) => {
    const { profileId } = req.params;
    const profile = await userProfile_model_1.UserProfile.findById(profileId);
    if (!profile) {
        throw new AppError_1.AppError("Profile not found", 404);
    }
    if (profile.profileStatus !== "pending_verification") {
        throw new AppError_1.AppError("Profile not eligible for rejection", 400);
    }
    profile.profileStatus = "rejected";
    await profile.save();
    res.json({
        message: "Profile rejected",
    });
};
exports.rejectProfile = rejectProfile;
