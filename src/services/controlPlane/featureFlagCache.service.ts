//backend/src/rervices/controlPlane/featuredFlagCache.service.ts

import { FeatureFlagDocument } from "../../models/featureFlag.model";

class FeatureFlagCache {
  private flags: FeatureFlagDocument[] | null = null;
  private lastLoadedAt: number = 0;
  private readonly TTL = 10_000; // 10 seconds

  isValid() {
    return Date.now() - this.lastLoadedAt < this.TTL;
  }

  get() {
    return this.flags;
  }

  set(flags: FeatureFlagDocument[]) {
    this.flags = flags;
    this.lastLoadedAt = Date.now();
  }

  invalidate() {
    this.flags = null;
  }
}

export const featureFlagCache = new FeatureFlagCache();
