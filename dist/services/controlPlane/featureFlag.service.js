"use strict";
//backend/src/rervices/controlPlane/featureFlag.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const featureFlag_model_1 = require("../../models/featureFlag.model");
const normalizeConditions = (conditions) => {
    if (!conditions)
        return undefined;
    return {
        roles: conditions.roles,
        userIds: conditions.userIds?.map((id) => new mongoose_1.default.Types.ObjectId(id)),
    };
};
class FeatureFlagService {
    static async getAll() {
        return featureFlag_model_1.FeatureFlag.find().sort({ createdAt: -1 });
    }
    static async create(payload, adminId) {
        return featureFlag_model_1.FeatureFlag.create({
            key: payload.key,
            description: payload.description,
            enabled: payload.enabled ?? false,
            scope: payload.scope ?? "GLOBAL",
            conditions: normalizeConditions(payload.conditions),
            createdBy: new mongoose_1.default.Types.ObjectId(adminId),
        });
    }
    static async update(flagId, payload, adminId) {
        return featureFlag_model_1.FeatureFlag.findByIdAndUpdate(flagId, {
            ...payload,
            conditions: normalizeConditions(payload.conditions),
            updatedBy: new mongoose_1.default.Types.ObjectId(adminId),
        }, { new: true });
    }
    static async toggle(flagId, enabled, adminId) {
        return featureFlag_model_1.FeatureFlag.findByIdAndUpdate(flagId, {
            enabled,
            updatedBy: new mongoose_1.default.Types.ObjectId(adminId),
        }, { new: true });
    }
    static async remove(flagId) {
        return featureFlag_model_1.FeatureFlag.findByIdAndDelete(flagId);
    }
}
exports.FeatureFlagService = FeatureFlagService;
