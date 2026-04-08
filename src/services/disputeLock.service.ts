//backend/src/services/disputeLock.service.ts

import { Appeal } from "../models/appeal.model";

// Phase 30.5 — Feature Flag Guard
import { FeatureFlagGuard } from "./controlPlane/featureFlagGuard.service";

/**
 * Throws if dispute is locked due to decided appeal
 * Feature-flagged via DISPUTE_LOCKING_ENABLED
 */
export const assertDisputeMutable = async (
  disputeId: string
) => {
  // ==========================
  // 🧯 FEATURE FLAG — DISPUTE LOCKING
  // ==========================
  try {
    await FeatureFlagGuard.requireEnabled(
      "DISPUTE_LOCKING_ENABLED",
      { role: "admin" }
    );
  } catch {
    // Locking disabled → dispute is mutable
    return;
  }

  // ==========================
  // 🔒 EXISTING LOCK LOGIC
  // ==========================
  const appeal = await Appeal.findOne({
    disputeId,
    status: { $in: ["UPHELD", "REJECTED"] },
  }).select("_id");

  if (appeal) {
    throw {
      status: 409,
      message: "Dispute is locked due to finalized appeal",
    };
  }
};