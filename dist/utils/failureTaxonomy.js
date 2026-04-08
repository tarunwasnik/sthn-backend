"use strict";
//backend/src/utils/failureTaxonomy.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFailClosed = exports.isFailOpen = exports.SUBSYSTEM_FAILURE_POLICY = void 0;
/**
 * Subsystem criticality classification
 *
 * This is the single source of truth for:
 * - what is allowed to fail
 * - what must never fail silently
 */
exports.SUBSYSTEM_FAILURE_POLICY = {
    DISPATCHER_CORE: "FAIL_CLOSED",
    THROTTLE_LOOKUP: "FAIL_CLOSED",
    POLICY_VALIDATION: "FAIL_CLOSED",
    EXECUTOR: "FAIL_CLOSED",
    AUDIT_LOGGING: "FAIL_OPEN",
    METRICS_EMISSION: "FAIL_OPEN",
    ANOMALY_DETECTION: "FAIL_OPEN",
};
/**
 * Utility helpers (pure)
 */
const isFailOpen = (subsystem) => exports.SUBSYSTEM_FAILURE_POLICY[subsystem] === "FAIL_OPEN";
exports.isFailOpen = isFailOpen;
const isFailClosed = (subsystem) => exports.SUBSYSTEM_FAILURE_POLICY[subsystem] === "FAIL_CLOSED";
exports.isFailClosed = isFailClosed;
