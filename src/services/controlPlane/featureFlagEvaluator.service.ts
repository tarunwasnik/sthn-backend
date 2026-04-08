//backend/src/rervices/controlPlane/featuredFlagEvaluator.service.ts

import { FeatureFlag } from "../../models/featureFlag.model";
import { featureFlagCache } from "./featureFlagCache.service";
import { FeatureFlagContext } from "../../types/featureFlagContext.types";

export class FeatureFlagEvaluator {
  static async isEnabled(
    key: string,
    context: FeatureFlagContext
  ): Promise<boolean> {
    const flags = await this.loadFlags();
    const flag = flags.find((f) => f.key === key);

    if (!flag) return false;
    if (!flag.enabled) return false;

    // GLOBAL
    if (flag.scope === "GLOBAL") {
      return true;
    }

    // ROLE scoped
    if (flag.scope === "ROLE") {
      if (!context.role) return false;
      return flag.conditions?.roles?.includes(context.role) ?? false;
    }

    // USER scoped
    if (flag.scope === "USER") {
      if (!context.userId) return false;
      return (
        flag.conditions?.userIds?.some(
          (id) => id.toString() === context.userId
        ) ?? false
      );
    }

    return false;
  }

  private static async loadFlags() {
    if (featureFlagCache.isValid() && featureFlagCache.get()) {
      return featureFlagCache.get()!;
    }

    const flags = await FeatureFlag.find();
    featureFlagCache.set(flags);
    return flags;
  }
}