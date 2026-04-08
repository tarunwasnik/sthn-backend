"use strict";
//backend/src/services/disputeLock.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDisputeMutable = void 0;
const appeal_model_1 = require("../models/appeal.model");
// Phase 30.5 — Feature Flag Guard
const featureFlagGuard_service_1 = require("./controlPlane/featureFlagGuard.service");
/**
 * Throws if dispute is locked due to decided appeal
 * Feature-flagged via DISPUTE_LOCKING_ENABLED
 */
const assertDisputeMutable = async (disputeId) => {
    // ==========================
    // 🧯 FEATURE FLAG — DISPUTE LOCKING
    // ==========================
    try {
        await featureFlagGuard_service_1.FeatureFlagGuard.requireEnabled("DISPUTE_LOCKING_ENABLED", { role: "admin" });
    }
    catch {
        // Locking disabled → dispute is mutable
        return;
    }
    // ==========================
    // 🔒 EXISTING LOCK LOGIC
    // ==========================
    const appeal = await appeal_model_1.Appeal.findOne({
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
exports.assertDisputeMutable = assertDisputeMutable;
