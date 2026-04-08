"use strict";
//backend/src/services/adminActions/adminThrottleEvaluator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAdminThrottleFromAlert = evaluateAdminThrottleFromAlert;
const adminActionAbuseSignals_1 = require("./adminActionAbuseSignals");
const adminThrottle_model_1 = require("../../models/adminThrottle.model");
/**
 * =========================
 * Throttle Duration Mapping
 * =========================
 */
const THROTTLE_DURATIONS_MS = {
    HIGH_RISK_BURST: 15 * 60 * 1000, // 15 minutes
    POLICY_PROBING: 30 * 60 * 1000, // 30 minutes
    DEPRECATED_PERSISTENCE: 2 * 60 * 60 * 1000, // 2 hours
};
/**
 * =========================
 * Builders
 * =========================
 */
function buildThrottleFromSignal(signal) {
    const durationMs = THROTTLE_DURATIONS_MS[signal.signalType];
    const now = Date.now();
    const throttleUntil = new Date(now + durationMs);
    return {
        adminId: signal.adminId,
        signalType: signal.signalType,
        derivedFromAlertType: signal.derivedFromAlertType,
        reason: signal.explanation,
        throttleUntil,
        expiresAt: throttleUntil,
        createdAt: new Date(),
    };
}
/**
 * =========================
 * Public API
 * =========================
 */
async function evaluateAdminThrottleFromAlert(alert) {
    const abuseSignals = (0, adminActionAbuseSignals_1.deriveAbuseSignalsFromAlert)(alert);
    if (abuseSignals.length === 0) {
        return [];
    }
    const throttleDocs = abuseSignals.map(buildThrottleFromSignal);
    const created = await adminThrottle_model_1.AdminThrottle.insertMany(throttleDocs);
    return created;
}
