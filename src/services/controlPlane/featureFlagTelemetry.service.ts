//backend/src/rervices/controlPlane/featureFlagTelemetry.service.ts

import { FeatureFlagEvent } from "../../models/featureFlagEvent.model";

interface FeatureFlagBlockEvent {
  flagKey: string;
  userId?: string;
  role?: string;
  context?: string;
  timestamp: number;
}

export const emitFeatureFlagBlock = async (
  event: FeatureFlagBlockEvent
) => {
  try {
    await FeatureFlagEvent.create({
      flagKey: event.flagKey,
      userId: event.userId,
      role: event.role,
      context: event.context,
      timestamp: new Date(event.timestamp),
    });
  } catch (err) {
    // 🔇 Telemetry must NEVER break production logic
    console.warn("[FEATURE_FLAG_TELEMETRY_FAILED]", {
      flagKey: event.flagKey,
      error: (err as Error).message,
    });
  }
};
