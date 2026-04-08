"use strict";
//backend/src/rervices/controlPlane/featuredFlagAlert.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateFeatureFlagAlerts = void 0;
const featureFlag_model_1 = require("../../models/featureFlag.model");
const featureFlagEvent_model_1 = require("../../models/featureFlagEvent.model");
const featureFlagAlertState_model_1 = require("../../models/featureFlagAlertState.model");
const DEFAULT_COOLDOWN_MINUTES = 30;
const evaluateFeatureFlagAlerts = async () => {
    const flags = await featureFlag_model_1.FeatureFlag.find({
        enabled: true,
        "alertConfig.threshold": { $gt: 0 },
    });
    const alerts = [];
    for (const flag of flags) {
        const alertConfig = flag.alertConfig;
        if (!alertConfig)
            continue;
        const { threshold, windowMinutes, severity, } = alertConfig;
        const since = new Date(Date.now() - windowMinutes * 60 * 1000);
        const count = await featureFlagEvent_model_1.FeatureFlagEvent.countDocuments({
            flagKey: flag.key,
            timestamp: { $gte: since },
        });
        if (count < threshold)
            continue;
        // ==========================
        // 🛑 DEDUP / COOLDOWN CHECK
        // ==========================
        const state = await featureFlagAlertState_model_1.FeatureFlagAlertState.findOne({
            flagKey: flag.key,
        });
        const cooldownMinutes = alertConfig.windowMinutes ??
            DEFAULT_COOLDOWN_MINUTES;
        if (state) {
            const nextAllowed = state.lastAlertAt.getTime() +
                cooldownMinutes * 60 * 1000;
            if (Date.now() < nextAllowed) {
                continue; // still cooling down
            }
        }
        // ==========================
        // 🔥 ALERT IS VALID
        // ==========================
        alerts.push({
            flagKey: flag.key,
            count,
            windowMinutes,
            threshold,
            severity,
        });
        // ==========================
        // 🧠 UPDATE ALERT STATE
        // ==========================
        await featureFlagAlertState_model_1.FeatureFlagAlertState.updateOne({ flagKey: flag.key }, {
            $set: {
                lastAlertAt: new Date(),
            },
        }, { upsert: true });
    }
    return alerts;
};
exports.evaluateFeatureFlagAlerts = evaluateFeatureFlagAlerts;
