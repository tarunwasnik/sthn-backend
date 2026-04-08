"use strict";
//backend/src/services/adminActions/adminActionAbuseSignals.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectHighRiskBurst = detectHighRiskBurst;
exports.detectPolicyProbing = detectPolicyProbing;
exports.detectDeprecatedPersistence = detectDeprecatedPersistence;
exports.deriveAbuseSignalsFromAlert = deriveAbuseSignalsFromAlert;
/**
 * =========================
 * Threshold Constants
 * =========================
 */
// High-risk burst abuse
const HIGH_RISK_BURST_THRESHOLD = 3;
const HIGH_RISK_BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Policy probing abuse
const POLICY_PROBING_THRESHOLD = 5;
const POLICY_PROBING_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
// Deprecated persistence abuse
const DEPRECATED_PERSISTENCE_THRESHOLD = 2;
const DEPRECATED_PERSISTENCE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * =========================
 * Helper Utilities
 * =========================
 */
function withinWindow(alert, windowMs) {
    return alert.lastSeenAt - alert.firstSeenAt <= windowMs;
}
/**
 * =========================
 * Abuse Evaluators
 * =========================
 */
function detectHighRiskBurst(alert) {
    if (alert.severity !== "critical" ||
        alert.count < HIGH_RISK_BURST_THRESHOLD ||
        !withinWindow(alert, HIGH_RISK_BURST_WINDOW_MS)) {
        return null;
    }
    return {
        signalType: "HIGH_RISK_BURST",
        adminId: alert.adminId,
        derivedFromAlertType: alert.type,
        explanation: "Multiple high-risk admin actions executed in a short time window",
        windowMs: HIGH_RISK_BURST_WINDOW_MS,
        threshold: HIGH_RISK_BURST_THRESHOLD,
        observedCount: alert.count,
    };
}
function detectPolicyProbing(alert) {
    if (alert.count < POLICY_PROBING_THRESHOLD ||
        !withinWindow(alert, POLICY_PROBING_WINDOW_MS)) {
        return null;
    }
    return {
        signalType: "POLICY_PROBING",
        adminId: alert.adminId,
        derivedFromAlertType: alert.type,
        explanation: "Repeated attempts to perform actions denied by policy",
        windowMs: POLICY_PROBING_WINDOW_MS,
        threshold: POLICY_PROBING_THRESHOLD,
        observedCount: alert.count,
    };
}
function detectDeprecatedPersistence(alert) {
    if (alert.count < DEPRECATED_PERSISTENCE_THRESHOLD ||
        !withinWindow(alert, DEPRECATED_PERSISTENCE_WINDOW_MS)) {
        return null;
    }
    return {
        signalType: "DEPRECATED_PERSISTENCE",
        adminId: alert.adminId,
        derivedFromAlertType: alert.type,
        explanation: "Deprecated admin actions used repeatedly after warning",
        windowMs: DEPRECATED_PERSISTENCE_WINDOW_MS,
        threshold: DEPRECATED_PERSISTENCE_THRESHOLD,
        observedCount: alert.count,
    };
}
/**
 * =========================
 * Aggregator (pure)
 * =========================
 */
function deriveAbuseSignalsFromAlert(alert) {
    const signals = [
        detectHighRiskBurst(alert),
        detectPolicyProbing(alert),
        detectDeprecatedPersistence(alert),
    ];
    return signals.filter(Boolean);
}
