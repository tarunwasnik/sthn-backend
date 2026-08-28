"use strict";
//backend/src/services/adminActions/actionExecutors/applyCreatorCooldown.executor.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCreatorCooldownExecutor = void 0;
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const cooldownLifecycle_service_1 = require("../../accountGovernance/cooldownLifecycle.service");
const mongoose_1 = __importDefault(require("mongoose"));
const auditLog_service_1 = require("../../auditLog.service");
const applyCreatorCooldownExecutor = async ({ adminId, creatorProfileId, days, reason, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile)
        throw new Error("Creator profile not found");
    const until = new Date();
    until.setDate(until.getDate() + days);
    const { user, replay } = await (0, cooldownLifecycle_service_1.applyAccountCooldown)({
        userId: creatorProfile.userId.toString(), kind: "CREATOR", until, reason, actorId: adminId,
    });
    // Legacy profile field is compatibility metadata only; resolver never reads it.
    creatorProfile.creatorCooldownUntil = user.creatorCooldownUntil;
    await creatorProfile.save();
    if (!replay) {
        await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(adminId), action: "CREATOR_COOLDOWN_APPLIED", entityType: "USER", entityId: user._id, after: { creatorCooldownUntil: user.creatorCooldownUntil, reason } });
    }
    return {
        userId: user._id,
        creatorProfileId: creatorProfile._id,
        cooldownUntil: user.creatorCooldownUntil,
        reason,
        replay,
    };
};
exports.applyCreatorCooldownExecutor = applyCreatorCooldownExecutor;
