"use strict";
//backend/src/rervices/controlPlane/featureFlagTelemetry.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitFeatureFlagBlock = void 0;
const featureFlagEvent_model_1 = require("../../models/featureFlagEvent.model");
const emitFeatureFlagBlock = async (event) => {
    try {
        await featureFlagEvent_model_1.FeatureFlagEvent.create({
            flagKey: event.flagKey,
            userId: event.userId,
            role: event.role,
            context: event.context,
            timestamp: new Date(event.timestamp),
        });
    }
    catch (err) {
        // 🔇 Telemetry must NEVER break production logic
        console.warn("[FEATURE_FLAG_TELEMETRY_FAILED]", {
            flagKey: event.flagKey,
            error: err.message,
        });
    }
};
exports.emitFeatureFlagBlock = emitFeatureFlagBlock;
