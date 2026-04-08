//backend/src/services/adminActions/adminActionAnomaly.types.ts


/**
 * Phase 26 — Anomaly Signals
 */

export type AdminActionAnomalyType =
  | "HIGH_RISK_SPIKE"
  | "POLICY_DENIAL_ABUSE"
  | "DEPRECATED_ACTION_USED";

export interface AdminActionAnomalySignal {
  type: AdminActionAnomalyType;

  timestamp: number;

  adminId: string;

  actionKey?: string;

  message: string;

  severity: "warning" | "critical";

  context?: Record<string, any>;
}



