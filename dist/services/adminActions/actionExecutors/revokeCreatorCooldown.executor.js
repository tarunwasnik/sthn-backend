"use strict";
//backend/src/services/adminActions/actionExecutors/revokeCreatorCooldown.executor.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCreatorCooldownExecutor = void 0;
const User_1 = __importDefault(require("../../../models/User"));
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const revokeCreatorCooldownExecutor = async ({ adminId, creatorProfileId, reason, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile)
        throw new Error("Creator profile not found");
    const user = await User_1.default.findById(creatorProfile.userId);
    if (!user)
        throw new Error("Target user not found");
    user.userCooldownUntil = undefined;
    user.userCooldownReason = reason;
    user.userCooldownBy = adminId;
    await user.save();
    return {
        userId: user._id,
        creatorProfileId: creatorProfile._id,
        revoked: true,
        reason,
    };
};
exports.revokeCreatorCooldownExecutor = revokeCreatorCooldownExecutor;
