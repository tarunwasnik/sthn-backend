"use strict";
//backend/src/services/adminActions/adminActionMetrics.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInMemoryAdminMetrics = exports.emitAdminActionMetric = void 0;
const AdminActionMetric_model_1 = __importDefault(require("../../models/AdminActionMetric.model"));
const adminActionAnomaly_service_1 = require("./adminActionAnomaly.service");
const adminActionSignal_service_1 = require("./adminActionSignal.service");
// Phase 28 — Resilience
const circuitBreaker_1 = require("../../utils/circuitBreaker");
const failureTaxonomy_1 = require("../../utils/failureTaxonomy");
/**
 * Phase 26 — Metrics & Anomaly Engine
 *
 * Phase 28 additions:
 * - Circuit breaker
 * - Fail-open semantics
 *
 * IMPORTANT:
 * - This service must NEVER throw
 * - Metrics must NEVER affect admin action execution
 */
// ----------------------------------
// In-memory rolling window
// ----------------------------------
const inMemoryWindow = [];
// Rolling window duration (5 minutes)
const WINDOW_MS = 5 * 60 * 1000;
// ----------------------------------
// Phase 28 — Circuit breaker (metrics)
// ----------------------------------
const metricsBreaker = new circuitBreaker_1.CircuitBreaker((0, circuitBreaker_1.createInMemoryBreakerState)(), {
    failureThreshold: 3,
    openDurationMs: 60 * 1000, // 1 minute cooldown
});
// ----------------------------------
// Public API
// ----------------------------------
/**
 * Emit an admin action metric.
 *
 * - Fire-and-forget
 * - Failure-safe
 * - Circuit-breaker protected
 */
const emitAdminActionMetric = async (event) => {
    try {
        // -----------------------------
        // 🚨 Circuit breaker check
        // -----------------------------
        if (!metricsBreaker.canProceed()) {
            // FAIL_OPEN: skip metrics silently
            return;
        }
        const now = Date.now();
        // -----------------------------
        // 1️⃣ Update in-memory window
        // -----------------------------
        inMemoryWindow.push(event);
        while (inMemoryWindow.length > 0 &&
            inMemoryWindow[0].timestamp < now - WINDOW_MS) {
            inMemoryWindow.shift();
        }
        // -----------------------------
        // 2️⃣ Persist to MongoDB
        // -----------------------------
        AdminActionMetric_model_1.default.create({
            type: event.type,
            timestamp: event.timestamp,
            adminId: event.adminId,
            adminRole: event.adminRole,
            actionKey: event.actionKey,
            actionVersion: event.actionVersion,
            riskLevel: event.riskLevel,
            targetId: event.targetId,
            dryRun: event.dryRun,
            outcome: event.outcome,
            reason: event.reason,
        }).catch(() => {
            // Count DB failure
            metricsBreaker.recordFailure();
        });
        // -----------------------------
        // 3️⃣ Anomaly detection
        // -----------------------------
        try {
            const signals = (0, adminActionAnomaly_service_1.detectAdminActionAnomalies)(inMemoryWindow);
            signals.forEach(adminActionSignal_service_1.recordAdminActionSignal);
            // Success path → close breaker if half-open
            metricsBreaker.recordSuccess();
        }
        catch {
            // Anomaly pipeline failure
            metricsBreaker.recordFailure();
        }
    }
    catch {
        // Absolute last line of defense
        // Metrics must NEVER throw
        if ((0, failureTaxonomy_1.isFailOpen)("METRICS_EMISSION")) {
            return;
        }
    }
};
exports.emitAdminActionMetric = emitAdminActionMetric;
/**
 * INTERNAL — Expose rolling window for testing/debugging only
 */
const getInMemoryAdminMetrics = () => inMemoryWindow;
exports.getInMemoryAdminMetrics = getInMemoryAdminMetrics;
