"use strict";
//backend/src/services/adminActions/actionExecutors/applyCreatorCooldown.executor.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCreatorCooldownExecutor = void 0;
const User_1 = __importDefault(require("../../../models/User"));
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const applyCreatorCooldownExecutor = async ({ adminId, creatorProfileId, days, reason, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile)
        throw new Error("Creator profile not found");
    const user = await User_1.default.findById(creatorProfile.userId);
    if (!user)
        throw new Error("Target user not found");
    const until = new Date();
    until.setDate(until.getDate() + days);
    // 🔹 USER LEVEL (enforcement)
    user.userCooldownUntil = until;
    user.userCooldownReason = reason;
    user.userCooldownBy = adminId;
    // 🔹 CREATOR PROFILE LEVEL (state tracking)
    creatorProfile.creatorCooldownUntil = until;
    await Promise.all([
        user.save(),
        creatorProfile.save(),
    ]);
    return {
        userId: user._id,
        creatorProfileId: creatorProfile._id,
        cooldownUntil: until,
        reason,
    };
};
exports.applyCreatorCooldownExecutor = applyCreatorCooldownExecutor;
