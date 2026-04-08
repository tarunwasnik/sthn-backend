//backend/src/rervices/controlPlane/featureFlagSlackEmitter.service.ts

interface FeatureFlagSlackAlert {
  flagKey: string;
  severity: string;
  count: number;
  threshold: number;
  windowMinutes: number;
}

const severityEmoji: Record<string, string> = {
  critical: "🚨",
  high: "⚠️",
  medium: "👀",
  low: "🧊",
};

export const emitFeatureFlagSlackAlert = async (
  alert: FeatureFlagSlackAlert
) => {
  const webhookUrl =
    process.env.SLACK_FEATURE_FLAG_WEBHOOK_URL;

  // Slack integration disabled
  if (!webhookUrl) return;

  const emoji =
    severityEmoji[alert.severity] ?? "🔔";

  const text = [
    `${emoji} *Feature Flag Alert*`,
    `*Flag:* \`${alert.flagKey}\``,
    `*Severity:* ${alert.severity.toUpperCase()}`,
    `*Blocks:* ${alert.count} (threshold ${alert.threshold})`,
    `*Window:* ${alert.windowMinutes} minutes`,
    `*Time:* ${new Date().toISOString()}`,
  ].join("\n");

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[FEATURE_FLAG_SLACK_ALERT_FAILED]", {
      error: (err as Error).message,
    });
  }
};