//backend/src/services/adminActions/adminActionAlert.types.ts


/**
 * Phase 26 — Alert Layer
 *
 * Alerts are deduplicated, rate-limited signals
 */

export type AdminActionAlertSeverity =
  | "warning"
  | "critical";

export interface AdminActionAlert {
  type: string;

  adminId: string;

  severity: AdminActionAlertSeverity;

  message: string;

  firstSeenAt: number;
  lastSeenAt: number;

  count: number;

  context?: Record<string, any>;
}