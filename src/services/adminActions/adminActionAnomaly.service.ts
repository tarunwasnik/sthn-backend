//backend/src/services/adminActions/adminActionAnomaly.service.ts


import {
  AdminActionMetricEvent,
} from "./adminActionMetrics.types";
import {
  AdminActionAnomalySignal,
} from "./adminActionAnomaly.types";

/**
 * Evaluate anomalies against a rolling metric window
 */
export const detectAdminActionAnomalies = (
  window: AdminActionMetricEvent[]
): AdminActionAnomalySignal[] => {
  const now = Date.now();
  const signals: AdminActionAnomalySignal[] = [];

  // -----------------------------
  // Rule A — High-risk spike
  // -----------------------------
  const highRiskByAdmin: Record<string, AdminActionMetricEvent[]> = {};

  window.forEach((e) => {
    if (e.riskLevel === "high" || e.riskLevel === "critical") {
      highRiskByAdmin[e.adminId] ||= [];
      highRiskByAdmin[e.adminId].push(e);
    }
  });

  Object.entries(highRiskByAdmin).forEach(([adminId, events]) => {
    const recent = events.filter(
      (e) => now - e.timestamp <= 5 * 60 * 1000
    );

    if (recent.length >= 3) {
      signals.push({
        type: "HIGH_RISK_SPIKE",
        timestamp: now,
        adminId,
        severity: "critical",
        message:
          "High-risk admin actions spike detected",
        context: {
          count: recent.length,
          actions: recent.map((e) => e.actionKey),
        },
      });
    }
  });

  // -----------------------------
  // Rule B — Policy denial abuse
  // -----------------------------
  const policyDeniedByAdmin: Record<string, number> = {};

  window.forEach((e) => {
    if (e.type === "ACTION_POLICY_DENIED") {
      if (now - e.timestamp <= 10 * 60 * 1000) {
        policyDeniedByAdmin[e.adminId] =
          (policyDeniedByAdmin[e.adminId] || 0) + 1;
      }
    }
  });

  Object.entries(policyDeniedByAdmin).forEach(
    ([adminId, count]) => {
      if (count >= 5) {
        signals.push({
          type: "POLICY_DENIAL_ABUSE",
          timestamp: now,
          adminId,
          severity: "warning",
          message:
            "Repeated policy-denied admin action attempts",
          context: { count },
        });
      }
    }
  );

  // -----------------------------
  // Rule C — Deprecated action usage
  // -----------------------------
  window.forEach((e) => {
    if (
      e.type === "ACTION_DEPRECATED_USED" &&
      !e.dryRun
    ) {
      signals.push({
        type: "DEPRECATED_ACTION_USED",
        timestamp: now,
        adminId: e.adminId,
        actionKey: e.actionKey,
        severity: "warning",
        message:
          "Deprecated admin action executed",
        context: {
          actionKey: e.actionKey,
          version: e.actionVersion,
        },
      });
    }
  });

  return signals;
};