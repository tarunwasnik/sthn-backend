//backend/src/rervices/controlPlane/featuredFlagAlert.service.ts

import { FeatureFlag } from "../../models/featureFlag.model";
import { FeatureFlagEvent } from "../../models/featureFlagEvent.model";
import {
  FeatureFlagAlertState,
} from "../../models/featureFlagAlertState.model";

export interface FeatureFlagAlert {
  flagKey: string;
  count: number;
  windowMinutes: number;
  threshold: number;
  severity: string;
}

const DEFAULT_COOLDOWN_MINUTES = 30;

export const evaluateFeatureFlagAlerts = async (): Promise<
  FeatureFlagAlert[]
> => {
  const flags = await FeatureFlag.find({
    enabled: true,
    "alertConfig.threshold": { $gt: 0 },
  });

  const alerts: FeatureFlagAlert[] = [];

  for (const flag of flags) {
    const alertConfig = flag.alertConfig;
    if (!alertConfig) continue;

    const {
      threshold,
      windowMinutes,
      severity,
    } = alertConfig;

    const since = new Date(
      Date.now() - windowMinutes * 60 * 1000
    );

    const count = await FeatureFlagEvent.countDocuments({
      flagKey: flag.key,
      timestamp: { $gte: since },
    });

    if (count < threshold) continue;

    // ==========================
    // 🛑 DEDUP / COOLDOWN CHECK
    // ==========================
    const state =
      await FeatureFlagAlertState.findOne({
        flagKey: flag.key,
      });

    const cooldownMinutes =
      alertConfig.windowMinutes ??
      DEFAULT_COOLDOWN_MINUTES;

    if (state) {
      const nextAllowed =
        state.lastAlertAt.getTime() +
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
    await FeatureFlagAlertState.updateOne(
      { flagKey: flag.key },
      {
        $set: {
          lastAlertAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  return alerts;
};