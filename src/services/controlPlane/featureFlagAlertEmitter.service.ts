//backend/src/rervices/controlPlane/featuredFlagAlertEnitter.service.ts

interface FeatureFlagAlertPayload {
  flagKey: string;
  count: number;
  windowMinutes: number;
  threshold: number;
  severity: string;
}

export const emitFeatureFlagAlert = (
  alert: FeatureFlagAlertPayload
) => {
  const level =
    alert.severity === "critical"
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