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
/**
 * Get all users
 * GET /api/v1/users
 */
exports.getUsers = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const users = await User_1.default.find().sort({ createdAt: -1 }).lean();
    const userIds = users.map((u) => u._id);
    const profiles = await userProfile_model_1.UserProfile.find({
        userId: { $in: userIds },
    }).lean();
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
    const profile = await userProfile_model_1.UserProfile.findOne({
        userId,
    }).lean();
    if (!profile) {
        return res.status(404).json({
            message: "Profile not found",
        });
    }
    return res.status(200).json({
        profile,
    });
});
