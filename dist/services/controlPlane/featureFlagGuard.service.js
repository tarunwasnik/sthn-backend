"use strict";
//backend/src/rervices/controlPlane/featuredFlagGuard.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagGuard = void 0;
const featureFlagEvaluator_service_1 = require("./featureFlagEvaluator.service");
const featureFlagTelemetry_service_1 = require("./featureFlagTelemetry.service");
class FeatureFlagGuard {
    static async requireEnabled(flagKey, context, errorMessage) {
        const enabled = await featureFlagEvaluator_service_1.FeatureFlagEvaluator.isEnabled(flagKey, context);
        if (!enabled) {
            (0, featureFlagTelemetry_service_1.emitFeatureFlagBlock)({
                flagKey,
                userId: context.userId,
                role: context.role,
                context: "requireEnabled",
                timestamp: Date.now(),
            });
            throw new Error(errorMessage ??
                `FEATURE_FLAG_DISABLED: ${flagKey}`);
        }
    }
}
exports.FeatureFlagGuard = FeatureFlagGuard;
