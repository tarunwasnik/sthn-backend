"use strict";
//backend/src/rervices/controlPlane/featureFlagPagerDutyEmitter.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitFeatureFlagPagerDutyAlert = void 0;
const emitFeatureFlagPagerDutyAlert = async (alert) => {
    const routingKey = process.env.PAGERDUTY_FEATURE_FLAG_INTEGRATION_KEY;
    // PagerDuty disabled
    if (!routingKey)
        return;
    // Escalate ONLY critical alerts
    if (alert.severity !== "critical")
        return;
    const payload = {
        routing_key: routingKey,
        event_action: "trigger",
        dedup_key: `feature-flag-${alert.flagKey}`,
        payload: {
            summary: `CRITICAL Feature Flag Blockage: ${alert.flagKey}`,
            severity: "critical",
            source: "control-plane",
            component: "feature-flags",
            group: "feature-flags",
            class: "feature-flag-alert",
            custom_details: {
                flagKey: alert.flagKey,
                blocks: alert.count,
                threshold: alert.threshold,
                windowMinutes: alert.windowMinutes,
                time: new Date().toISOString(),
            },
        },
    };
    try {
        await fetch("https://events.pagerduty.com/v2/enqueue", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    }
    catch (err) {
        console.error("[FEATURE_FLAG_PAGERDUTY_ALERT_FAILED]", {
            error: err.message,
        });
    }
};
exports.emitFeatureFlagPagerDutyAlert = emitFeatureFlagPagerDutyAlert;
