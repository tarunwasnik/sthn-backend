//backend/src/services/adminActions/adminThrottleEvaluator.ts

/**
 * Phase 27 — Admin Throttle Evaluator
 *
 * Converts Phase 26 alerts → abuse signals → admin throttles.
 * No enforcement. No dispatcher logic.
 */

import { Document } from "mongoose";
import { AdminActionAlert } from "./adminActionAlert.types";
import {
  AdminAbuseSignal,
  AdminAbuseSignalType,
  deriveAbuseSignalsFromAlert,
} from "./adminActionAbuseSignals";
import {
  AdminThrottle,
  IAdminThrottle,
} from "../../models/adminThrottle.model";

/**
 * =========================
 * Throttle Duration Mapping
 * =========================
 */

const THROTTLE_DURATIONS_MS: Record<AdminAbuseSignalType, number> = {
  HIGH_RISK_BURST: 15 * 60 * 1000,          // 15 minutes
  POLICY_PROBING: 30 * 60 * 1000,           // 30 minutes
  DEPRECATED_PERSISTENCE: 2 * 60 * 60 * 1000, // 2 hours
};

/**
 * =========================
 * Types
 * =========================
 */

// ✅ Plain data type for inserts (NO Mongoose methods)
type AdminThrottleCreateInput = Omit<
  IAdminThrottle,
  "_id" | keyof Document
>;

/**
 * =========================
 * Builders
 * =========================
 */

function buildThrottleFromSignal(
  signal: AdminAbuseSignal
): AdminThrottleCreateInput {
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

export async function evaluateAdminThrottleFromAlert(
  alert: AdminActionAlert
): Promise<IAdminThrottle[]> {
  const abuseSignals = deriveAbuseSignalsFromAlert(alert);

  if (abuseSignals.length === 0) {
    return [];
  }

  const throttleDocs = abuseSignals.map(buildThrottleFromSignal);

  const created = await AdminThrottle.insertMany(throttleDocs);

  return created;
}