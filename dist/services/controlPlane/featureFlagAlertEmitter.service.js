"use strict";
//backend/src/rervices/controlPlane/featuredFlagAlertEnitter.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitFeatureFlagAlert = void 0;
const emitFeatureFlagAlert = (alert) => {
    const level = alert.severity === "critical"
        ? "error"
        : alert.severity === "high"
            ? "warn"
            : alert.severity === "medium"
                ? "info"
                : "debug";
    console[level]("[FEATURE_FLAG_ALERT]", {
        flag: alert.flagKey,
        severity: alert.severity,
        blocks: alert.count,
        threshold: alert.threshold,
        windowMinutes: alert.windowMinutes,
        at: new Date().toISOString(),
    });
};
exports.emitFeatureFlagAlert = emitFeatureFlagAlert;
