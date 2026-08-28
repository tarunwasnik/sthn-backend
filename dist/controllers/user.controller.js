"use strict";
// backend/src/controllers/user.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPublicProfile = exports.getUsers = void 0;
const User_1 = __importDefault(require("../models/User"));
const userProfile_model_1 = require("../models/userProfile.model");
const asyncHandler_1 = require("../middlewares/asyncHandler");
const publicUserProfile_dto_1 = require("../dtos/user/publicUserProfile.dto");
const calculateAge_1 = require("../utils/calculateAge");
const mongoose_1 = __importDefault(require("mongoose"));
/**
 * Get all users
 * GET /api/v1/users
 */
exports.getUsers = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const users = await User_1.default.find()
        .select("email role status createdAt")
        .sort({ createdAt: -1 })
        .lean();
    const userIds = users.map((u) => u._id);
    const profiles = await userProfile_model_1.UserProfile.find({
        userId: { $in: userIds },
    })
        .select("userId username")
        .lean();
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));
    res.json(users.map((user) => {
        const profile = profileMap.get(user._id.toString());
        return {
            id: user._id,
            email: user.email,
            role: user.role,
            status: user.status,
            username: profile?.username || null,
            createdAt: user.createdAt,
        };
    }));
});
/**
 * ✅ NEW: Get public user profile
 * GET /api/v1/users/:userId
 */
exports.getUserPublicProfile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
            message: "Invalid userId",
        });
    }
    const profile = await userProfile_model_1.UserProfile.findOne({
        userId,
    })
        .select("username dateOfBirth avatar cover bio interests country city languages profilePhotos")
        .lean();
    if (!profile) {
        return res.status(404).json({
            message: "Profile not found",
        });
    }
    return res.status(200).json({
        profile: (0, publicUserProfile_dto_1.toPublicUserProfileDto)(profile, calculateAge_1.calculateAge),
    });
});
