"use strict";
//backend/src/rervices/controlPlane/featuredFlagEvaluator.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagEvaluator = void 0;
const featureFlag_model_1 = require("../../models/featureFlag.model");
const featureFlagCache_service_1 = require("./featureFlagCache.service");
class FeatureFlagEvaluator {
    static async isEnabled(key, context) {
        const flags = await this.loadFlags();
        const flag = flags.find((f) => f.key === key);
        if (!flag)
            return false;
        if (!flag.enabled)
            return false;
        // GLOBAL
        if (flag.scope === "GLOBAL") {
            return true;
        }
        // ROLE scoped
        if (flag.scope === "ROLE") {
            if (!context.role)
                return false;
            return flag.conditions?.roles?.includes(context.role) ?? false;
        }
        // USER scoped
        if (flag.scope === "USER") {
            if (!context.userId)
                return false;
            return (flag.conditions?.userIds?.some((id) => id.toString() === context.userId) ?? false);
        }
        return false;
    }
    static async loadFlags() {
        if (featureFlagCache_service_1.featureFlagCache.isValid() && featureFlagCache_service_1.featureFlagCache.get()) {
            return featureFlagCache_service_1.featureFlagCache.get();
        }
        const flags = await featureFlag_model_1.FeatureFlag.find();
        featureFlagCache_service_1.featureFlagCache.set(flags);
        return flags;
    }
}
exports.FeatureFlagEvaluator = FeatureFlagEvaluator;
