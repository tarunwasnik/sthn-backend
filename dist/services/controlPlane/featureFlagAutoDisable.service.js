"use strict";
//backend/src/rervices/controlPlane/featuredFlagAutoDisable.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAutoDisableFeatureFlag = void 0;
const featureFlag_model_1 = require("../../models/featureFlag.model");
const featureFlagAlertState_model_1 = require("../../models/featureFlagAlertState.model");
const evaluateAutoDisableFeatureFlag = async ({ flagKey, severity, }) => {
    if (severity !== "critical")
        return;
    const flag = await featureFlag_model_1.FeatureFlag.findOne({ key: flagKey });
    if (!flag)
        return;
    const auto = flag.autoDisableOnCritical;
    if (!auto?.enabled)
        return;
    const state = await featureFlagAlertState_model_1.FeatureFlagAlertState.findOne({
        flagKey,
    });
    if (!state)
        return;
    const now = Date.now();
    // First time critical
    if (!state.firstCriticalAt) {
        state.firstCriticalAt = new Date();
        await state.save();
        return;
    }
    const elapsedMinutes = (now - state.firstCriticalAt.getTime()) /
        (60 * 1000);
    if (elapsedMinutes < auto.afterMinutes) {
        return;
    }
    // 🔥 AUTO-DISABLE
    if (flag.enabled) {
        flag.enabled = false;
        await flag.save();
        console.error("[FEATURE_FLAG_AUTO_DISABLED]", {
            flagKey,
            afterMinutes: auto.afterMinutes,
            disabledAt: new Date().toISOString(),
        });
    }
};
exports.evaluateAutoDisableFeatureFlag = evaluateAutoDisableFeatureFlag;
