//backend/src/rervices/controlPlane/featuredFlagAutoDisable.service.ts

import { FeatureFlag } from "../../models/featureFlag.model";
import {
  FeatureFlagAlertState,
} from "../../models/featureFlagAlertState.model";

export const evaluateAutoDisableFeatureFlag = async ({
  flagKey,
  severity,
}: {
  flagKey: string;
  severity: string;
}) => {
  if (severity !== "critical") return;

  const flag = await FeatureFlag.findOne({ key: flagKey });
  if (!flag) return;

  const auto = flag.autoDisableOnCritical;
  if (!auto?.enabled) return;

  const state = await FeatureFlagAlertState.findOne({
    flagKey,
  });

  if (!state) return;

  const now = Date.now();

  // First time critical
  if (!state.firstCriticalAt) {
    state.firstCriticalAt = new Date();
    await state.save();
    return;
  }

  const elapsedMinutes =
    (now - state.firstCriticalAt.getTime()) /
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