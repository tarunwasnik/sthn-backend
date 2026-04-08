"use strict";
//backend/src/services/adminActions/adminActionAlert.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveAdminAlerts = exports.processAdminActionSignal = void 0;
/**
 * Alert cooldowns (ms) per anomaly type
 * Prevents alert spam
 */
const ALERT_COOLDOWNS = {
    HIGH_RISK_SPIKE: 5 * 60 * 1000, // 5 min
    POLICY_DENIAL_ABUSE: 10 * 60 * 1000, // 10 min
    DEPRECATED_ACTION_USED: 30 * 60 * 1000 // 30 min
};
/**
 * In-memory alert state
 * Key: adminId:type
 */
const activeAlerts = new Map();
/**
 * Convert anomaly signals into rate-limited alerts
 */
const processAdminActionSignal = (signal) => {
    const key = `${signal.adminId}:${signal.type}`;
    const now = Date.now();
    const cooldown = ALERT_COOLDOWNS[signal.type] ?? 5 * 60 * 1000;
    const existing = activeAlerts.get(key);
    // -----------------------------
    // New alert
    // -----------------------------
    if (!existing) {
        const alert = {
            type: signal.type,
            adminId: signal.adminId,
            severity: signal.severity,
            message: signal.message,
            firstSeenAt: now,
            lastSeenAt: now,
            count: 1,
            context: signal.context,
        };
        activeAlerts.set(key, alert);
        return alert;
    }
    // -----------------------------
    // Existing alert
    // -----------------------------
    if (now - existing.lastSeenAt < cooldown) {
        // Still in cooldown — update stats only
        existing.lastSeenAt = now;
        existing.count += 1;
        // Escalate severity if needed
        if (existing.severity === "warning" &&
            signal.severity === "critical") {
            existing.severity = "critical";
        }
        return null; // suppressed
    }
    // -----------------------------
    // Cooldown passed — re-emit
    // -----------------------------
    existing.lastSeenAt = now;
    existing.count += 1;
    existing.context = signal.context;
    return existing;
};
exports.processAdminActionSignal = processAdminActionSignal;
/**
 * INTERNAL — for debugging / inspection
 */
const getActiveAdminAlerts = () => {
    return Array.from(activeAlerts.values());
};
exports.getActiveAdminAlerts = getActiveAdminAlerts;
