//backend/src/jobs/featureFlagAlert.job.ts

import {
  evaluateFeatureFlagAlerts,
} from "../services/controlPlane/featureFlagAlert.service";

import {
  emitFeatureFlagAlert,
} from "../services/controlPlane/featureFlagAlertEmitter.service";

import {
  emitFeatureFlagSlackAlert,
} from "../services/controlPlane/featureFlagSlackEmitter.service";

import {
  emitFeatureFlagPagerDutyAlert,
} from "../services/controlPlane/featureFlagPagerDutyEmitter.service";


import {
  evaluateAutoDisableFeatureFlag,
} from "../services/controlPlane/featureFlagAutoDisable.service";

export const runFeatureFlagAlertJob = async () => {
  try {
    const alerts = await evaluateFeatureFlagAlerts();

    for (const alert of alerts) {
      // Logs
      emitFeatureFlagAlert({
        flagKey: alert.flagKey,
        count: alert.count,
        windowMinutes: alert.windowMinutes,
        threshold: alert.threshold,
        severity: alert.severity,
      });

      // Slack (all severities)
      await emitFeatureFlagSlackAlert({
        flagKey: alert.flagKey,
        severity: alert.severity,
        count: alert.count,
        threshold: alert.threshold,
        windowMinutes: alert.windowMinutes,
      });

      // PagerDuty (critical only)
      await emitFeatureFlagPagerDutyAlert({
        flagKey: alert.flagKey,
        severity: alert.severity,
        count: alert.count,
        threshold: alert.threshold,
        windowMinutes: alert.windowMinutes,
      });


      await evaluateAutoDisableFeatureFlag({
        flagKey: alert.flagKey,
        severity: alert.severity,
      });
    }
  } catch (err) {
    console.error("[FEATURE_FLAG_ALERT_JOB_FAILED]", {
      error: (err as Error).message,
    });
  }
};