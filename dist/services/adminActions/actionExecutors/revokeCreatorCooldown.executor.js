"use strict";
//backend/src/services/adminActions/actionExecutors/revokeCreatorCooldown.executor.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCreatorCooldownExecutor = void 0;
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const cooldownLifecycle_service_1 = require("../../accountGovernance/cooldownLifecycle.service");
const mongoose_1 = __importDefault(require("mongoose"));
const auditLog_service_1 = require("../../auditLog.service");
const revokeCreatorCooldownExecutor = async ({ adminId, creatorProfileId, reason, }) => {
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findById(creatorProfileId);
    if (!creatorProfile)
        throw new Error("Creator profile not found");
    const { user, revoked } = await (0, cooldownLifecycle_service_1.revokeAccountCooldown)({
        userId: creatorProfile.userId.toString(), kind: "CREATOR",
    });
    creatorProfile.creatorCooldownUntil = null;
    await creatorProfile.save();
    if (revoked) {
        await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(adminId), action: "CREATOR_COOLDOWN_REVOKED", entityType: "USER", entityId: user._id, after: { creatorCooldownUntil: null } });
    }
    return {
        userId: user._id,
        creatorProfileId: creatorProfile._id,
        revoked,
        reason,
    };
};
exports.revokeCreatorCooldownExecutor = revokeCreatorCooldownExecutor;
