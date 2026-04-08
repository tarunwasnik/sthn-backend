//backend/src/services/adminActions/adminActionMetrics.types.ts

/**
 * Phase 26 — Admin Action Metrics & Signals
 *
 * This file defines the canonical event vocabulary.
 * No behavior. No storage. No side effects.
 */

/**
 * High-level metric event types
 */
export type AdminActionMetricType =
  | "ACTION_EXECUTED"
  | "ACTION_FAILED"
  | "ACTION_BLOCKED"
  | "ACTION_POLICY_DENIED"
  | "ACTION_DRY_RUN"
  | "ACTION_DEPRECATED_USED";

/**
 * Risk levels already defined in registry
 * (redeclared here for decoupling)
 */
export type AdminActionRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

/**
 * Metric event payload
 * Emitted by dispatcher
 */
export interface AdminActionMetricEvent {
  type: AdminActionMetricType;

  timestamp: number; // epoch ms

  adminId: string;
  adminRole: string;

  actionKey: string;
  actionVersion: number;
  riskLevel: AdminActionRiskLevel;

  targetId: string;

  /**
   * Execution context
   */
  dryRun: boolean;
  outcome?: "EXECUTED" | "FAILED" | "BLOCKED" | "DENIED";

  /**
   * Optional diagnostic info
   */
  reason?: string;
}
