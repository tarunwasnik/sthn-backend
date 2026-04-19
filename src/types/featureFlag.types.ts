//backend/src/types/featurFlag.types.ts

export type FeatureFlagScope = "GLOBAL" | "ROLE" | "USER";

export interface FeatureFlagConditions {
  roles?: string[];
  userIds?: string[];
}

export interface CreateFeatureFlagPayload {
  key: string;
  description?: string;
  enabled?: boolean;
  scope?: FeatureFlagScope;
  conditions?: FeatureFlagConditions;
}
