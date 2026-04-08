//backend/src/services/adminActions/adminActionAbuseSignals.ts


/**
 * Phase 27 — Abuse Signal Definitions
 *
 * This layer derives abuse signals purely from Phase 26 alerts.
 * No side effects. No enforcement. No persistence.
 */

import { AdminActionAlert } from "./adminActionAlert.types";

/**
 * Abuse signal identifiers (internal, not user-facing)
 */
export type AdminAbuseSignalType =
  | "HIGH_RISK_BURST"
  | "POLICY_PROBING"
  | "DEPRECATED_PERSISTENCE";

/**
 * Human-explainable abuse signal
 */
export interface AdminAbuseSignal {
  signalType: AdminAbuseSignalType;
  adminId: string;
  derivedFromAlertType: string;
  explanation: string;
  windowMs: number;
  threshold: number;
  observedCount: number;
}

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

function withinWindow(alert: AdminActionAlert, windowMs: number): boolean {
  return alert.lastSeenAt - alert.firstSeenAt <= windowMs;
}

/**
 * =========================
 * Abuse Evaluators
 * =========================
 */

export function detectHighRiskBurst(
  alert: AdminActionAlert
): AdminAbuseSignal | null {
  if (
    alert.severity !== "critical" ||
    alert.count < HIGH_RISK_BURST_THRESHOLD ||
    !withinWindow(alert, HIGH_RISK_BURST_WINDOW_MS)
  ) {
    return null;
  }

  return {
    signalType: "HIGH_RISK_BURST",
    adminId: alert.adminId,
    derivedFromAlertType: alert.type,
    explanation:
      "Multiple high-risk admin actions executed in a short time window",
    windowMs: HIGH_RISK_BURST_WINDOW_MS,
    threshold: HIGH_RISK_BURST_THRESHOLD,
    observedCount: alert.count,
  };
}

export function detectPolicyProbing(
  alert: AdminActionAlert
): AdminAbuseSignal | null {
  if (
    alert.count < POLICY_PROBING_THRESHOLD ||
    !withinWindow(alert, POLICY_PROBING_WINDOW_MS)
  ) {
    return null;
  }

  return {
    signalType: "POLICY_PROBING",
    adminId: alert.adminId,
    derivedFromAlertType: alert.type,
    explanation:
      "Repeated attempts to perform actions denied by policy",
    windowMs: POLICY_PROBING_WINDOW_MS,
    threshold: POLICY_PROBING_THRESHOLD,
    observedCount: alert.count,
  };
}

export function detectDeprecatedPersistence(
  alert: AdminActionAlert
): AdminAbuseSignal | null {
  if (
    alert.count < DEPRECATED_PERSISTENCE_THRESHOLD ||
    !withinWindow(alert, DEPRECATED_PERSISTENCE_WINDOW_MS)
  ) {
    return null;
  }

  return {
    signalType: "DEPRECATED_PERSISTENCE",
    adminId: alert.adminId,
    derivedFromAlertType: alert.type,
    explanation:
      "Deprecated admin actions used repeatedly after warning",
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

export function deriveAbuseSignalsFromAlert(
  alert: AdminActionAlert
): AdminAbuseSignal[] {
  const signals: (AdminAbuseSignal | null)[] = [
    detectHighRiskBurst(alert),
    detectPolicyProbing(alert),
    detectDeprecatedPersistence(alert),
  ];

  return signals.filter(Boolean) as AdminAbuseSignal[];
}