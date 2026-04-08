"use strict";
//backend/src/rervices/controlPlane/featureFlagSlackEmitter.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitFeatureFlagSlackAlert = void 0;
const severityEmoji = {
    critical: "🚨",
    high: "⚠️",
    medium: "👀",
    low: "🧊",
};
const emitFeatureFlagSlackAlert = async (alert) => {
    const webhookUrl = process.env.SLACK_FEATURE_FLAG_WEBHOOK_URL;
    // Slack integration disabled
    if (!webhookUrl)
        return;
    const emoji = severityEmoji[alert.severity] ?? "🔔";
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
    }
    catch (err) {
        console.error("[FEATURE_FLAG_SLACK_ALERT_FAILED]", {
            error: err.message,
        });
    }
};
exports.emitFeatureFlagSlackAlert = emitFeatureFlagSlackAlert;
