"use strict";
//backend/src/services/adminActions/revokeCreatorCooldown.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCreatorCooldownService = void 0;
const revokeCreatorCooldown_executor_1 = require("./actionExecutors/revokeCreatorCooldown.executor");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const User_1 = __importDefault(require("../../models/User"));
const revokeCreatorCooldownService = async ({ adminId, creatorProfileId, reason, dryRun = false, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile) {
        throw new Error("Creator profile not found");
    }
    const now = new Date();
    const targetUser = await User_1.default.findById(creatorProfile.userId).select("creatorCooldownUntil").lean();
    if (!targetUser)
        throw new Error("Target user not found");
    const currentCooldown = targetUser.creatorCooldownUntil ?? null;
    const hasCooldown = currentCooldown !== null;
    const isActiveCooldown = hasCooldown && currentCooldown.getTime() > now.getTime();
    // ==========================
    // 🔥 DRY RUN MODE (Phase 20.5)
    // ==========================
    if (dryRun) {
        if (!hasCooldown) {
            return {
                mode: "DRY_RUN",
                action: "REVOKE_CREATOR_COOLDOWN",
                blocked: true,
                reason: "Creator has no cooldown to revoke",
                currentState: {
                    cooldownUntil: null,
                },
                diff: {},
                summary: "No changes will be made",
            };
        }
        if (!isActiveCooldown) {
            return {
                mode: "DRY_RUN",
                action: "REVOKE_CREATOR_COOLDOWN",
                blocked: true,
                reason: "Creator cooldown has already expired",
                currentState: {
                    cooldownUntil: currentCooldown,
                },
                diff: {},
                summary: "No changes will be made",
            };
        }
        return {
            mode: "DRY_RUN",
            action: "REVOKE_CREATOR_COOLDOWN",
            currentState: {
                cooldownUntil: currentCooldown,
            },
            futureState: {
                cooldownUntil: null,
            },
            diff: {
                creatorCooldownUntil: {
                    before: currentCooldown,
                    after: null,
                },
            },
            impact: {
                bookingsUnblocked: true,
            },
            summary: "Creator cooldown will be revoked",
        };
    }
    // ==========================
    // 🔹 REAL EXECUTION MODE
    // ==========================
    return (0, revokeCreatorCooldown_executor_1.revokeCreatorCooldownExecutor)({
        adminId,
        creatorProfileId,
        reason,
    });
};
exports.revokeCreatorCooldownService = revokeCreatorCooldownService;
