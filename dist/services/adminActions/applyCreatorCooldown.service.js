"use strict";
//backend/src/services/adminActions/applyCreatorCooldown.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCreatorCooldownService = void 0;
const applyCreatorCooldown_executor_1 = require("./actionExecutors/applyCreatorCooldown.executor");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const applyCreatorCooldownService = async ({ adminId, creatorProfileId, days, reason, dryRun = false, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile) {
        throw new Error("Creator profile not found");
    }
    const now = new Date();
    const currentCooldown = creatorProfile.creatorCooldownUntil ?? null;
    const hasActiveCooldown = currentCooldown !== null && currentCooldown.getTime() > now.getTime();
    const newCooldownUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const isFutureCooldown = newCooldownUntil.getTime() > now.getTime();
    // ==========================
    // 🔥 DRY RUN MODE (Phase 20.5)
    // ==========================
    if (dryRun) {
        if (hasActiveCooldown) {
            return {
                mode: "DRY_RUN",
                action: "APPLY_CREATOR_COOLDOWN",
                blocked: true,
                reason: `Creator is already on cooldown until ${currentCooldown.toISOString()}`,
                currentState: {
                    cooldownUntil: currentCooldown,
                },
                diff: {},
                summary: "No changes will be made",
            };
        }
        if (!isFutureCooldown) {
            return {
                mode: "DRY_RUN",
                action: "APPLY_CREATOR_COOLDOWN",
                blocked: true,
                reason: "Cooldown end date must be in the future",
                currentState: {
                    cooldownUntil: currentCooldown,
                },
                diff: {},
                summary: "No changes will be made",
            };
        }
        return {
            mode: "DRY_RUN",
            action: "APPLY_CREATOR_COOLDOWN",
            currentState: {
                cooldownUntil: currentCooldown,
            },
            futureState: {
                cooldownUntil: newCooldownUntil,
            },
            diff: {
                creatorCooldownUntil: {
                    before: currentCooldown,
                    after: newCooldownUntil,
                },
            },
            impact: {
                bookingsBlocked: true,
                durationDays: days,
            },
            summary: `Creator will be blocked until ${newCooldownUntil.toISOString()}`,
        };
    }
    // ==========================
    // 🔹 REAL EXECUTION MODE
    // ==========================
    if (hasActiveCooldown) {
        throw new Error(`Cannot apply cooldown: creator is already on cooldown until ${currentCooldown.toISOString()}`);
    }
    if (!isFutureCooldown) {
        throw new Error("Cannot apply cooldown: cooldown end date must be in the future");
    }
    return (0, applyCreatorCooldown_executor_1.applyCreatorCooldownExecutor)({
        adminId,
        creatorProfileId,
        days,
        reason,
    });
};
exports.applyCreatorCooldownService = applyCreatorCooldownService;
