"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminGovernanceTarget = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const accountGovernanceResolver_service_1 = require("./accountGovernance/accountGovernanceResolver.service");
const AppError_1 = require("../utils/AppError");
const iso = (value) => value ? value.toISOString() : null;
/** Read-only, deliberately bounded DTO for the Admin Governance workspace. */
const getAdminGovernanceTarget = async (userId) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId))
        throw new AppError_1.AppError("Invalid user id", 400);
    const user = await User_1.default.findById(userId).select([
        "email role status creatorStatus governanceState governanceReason governanceTriggeredAt governanceTriggeredBy",
        "userCooldownUntil userCooldownReason userCooldownTriggeredAt",
        "creatorCooldownUntil creatorCooldownReason creatorCooldownTriggeredAt abuseScore",
    ].join(" "));
    if (!user)
        throw new AppError_1.AppError("User not found", 404);
    const creator = await creatorProfile_model_1.CreatorProfile.findOne({ userId: user._id }).select("status creatorCooldownUntil").lean();
    const resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user);
    return {
        user: {
            id: String(user._id), email: user.email, role: user.role, status: user.status,
            creatorStatus: user.creatorStatus, governanceState: user.governanceState,
            governanceReason: user.governanceReason ?? null, governanceTriggeredAt: iso(user.governanceTriggeredAt),
            governanceTriggeredBy: user.governanceTriggeredBy ? String(user.governanceTriggeredBy) : null,
            userCooldownUntil: iso(user.userCooldownUntil), userCooldownReason: user.userCooldownReason ?? null,
            userCooldownTriggeredAt: iso(user.userCooldownTriggeredAt),
            creatorCooldownUntil: iso(user.creatorCooldownUntil), creatorCooldownReason: user.creatorCooldownReason ?? null,
            creatorCooldownTriggeredAt: iso(user.creatorCooldownTriggeredAt), abuseScore: user.abuseScore,
        },
        creator: creator ? {
            creatorProfileId: String(creator._id), status: creator.status,
            creatorCooldownUntil: iso(creator.creatorCooldownUntil),
        } : null,
        resolved: {
            condition: resolved.condition, governanceState: resolved.governanceState,
            isCooldownActive: resolved.isCooldownActive, isUserCooldownActive: resolved.isUserCooldownActive,
            isCreatorCooldownActive: resolved.isCreatorCooldownActive, cooldownUntil: iso(resolved.cooldownUntil),
            blocksOutgoingBookings: resolved.blocksOutgoingBookings, blocksIncomingBookings: resolved.blocksIncomingBookings,
            blocksAcceptingBookings: resolved.blocksAcceptingBookings, hasRestrictedDashboardAccess: resolved.hasRestrictedDashboardAccess,
            hasNoAccountAccess: resolved.hasNoAccountAccess,
        },
    };
};
exports.getAdminGovernanceTarget = getAdminGovernanceTarget;
