//backend/src/rervices/controlPlane/featuredFlagGuard.service.ts

import { FeatureFlagEvaluator } from "./featureFlagEvaluator.service";
import { FeatureFlagContext } from "../../types/featureFlagContext.types";
import { emitFeatureFlagBlock } from "./featureFlagTelemetry.service";

export class FeatureFlagGuard {
  static async requireEnabled(
    flagKey: string,
    context: FeatureFlagContext,
    errorMessage?: string
  ): Promise<void> {
    const enabled = await FeatureFlagEvaluator.isEnabled(
      flagKey,
      context
    );

    if (!enabled) {
      emitFeatureFlagBlock({
        flagKey,
        userId: context.userId,
        role: context.role,
        context: "requireEnabled",
        timestamp: Date.now(),
      });

      throw new Error(
        errorMessage ??
          `FEATURE_FLAG_DISABLED: ${flagKey}`
      );
    }
  }
}
