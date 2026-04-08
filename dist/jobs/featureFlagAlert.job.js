"use strict";
//backend/src/jobs/featureFlagAlert.job.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFeatureFlagAlertJob = void 0;
const featureFlagAlert_service_1 = require("../services/controlPlane/featureFlagAlert.service");
const featureFlagAlertEmitter_service_1 = require("../services/controlPlane/featureFlagAlertEmitter.service");
const featureFlagSlackEmitter_service_1 = require("../services/controlPlane/featureFlagSlackEmitter.service");
const featureFlagPagerDutyEmitter_service_1 = require("../services/controlPlane/featureFlagPagerDutyEmitter.service");
const featureFlagAutoDisable_service_1 = require("../services/controlPlane/featureFlagAutoDisable.service");
const runFeatureFlagAlertJob = async () => {
    try {
        const alerts = await (0, featureFlagAlert_service_1.evaluateFeatureFlagAlerts)();
        for (const alert of alerts) {
            // Logs
            (0, featureFlagAlertEmitter_service_1.emitFeatureFlagAlert)({
                flagKey: alert.flagKey,
                count: alert.count,
                windowMinutes: alert.windowMinutes,
                threshold: alert.threshold,
                severity: alert.severity,
            });
            // Slack (all severities)
            await (0, featureFlagSlackEmitter_service_1.emitFeatureFlagSlackAlert)({
                flagKey: alert.flagKey,
                severity: alert.severity,
                count: alert.count,
                threshold: alert.threshold,
                windowMinutes: alert.windowMinutes,
            });
            // PagerDuty (critical only)
            await (0, featureFlagPagerDutyEmitter_service_1.emitFeatureFlagPagerDutyAlert)({
                flagKey: alert.flagKey,
                severity: alert.severity,
                count: alert.count,
                threshold: alert.threshold,
                windowMinutes: alert.windowMinutes,
            });
            await (0, featureFlagAutoDisable_service_1.evaluateAutoDisableFeatureFlag)({
                flagKey: alert.flagKey,
                severity: alert.severity,
            });
        }
    }
    catch (err) {
        console.error("[FEATURE_FLAG_ALERT_JOB_FAILED]", {
            error: err.message,
        });
    }
};
exports.runFeatureFlagAlertJob = runFeatureFlagAlertJob;
