"use strict";
//backend/src/types/controlPlane.types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAIL_CLOSED_EVALUATION = exports.ControlPlaneScope = exports.ControlPlaneEnforcement = void 0;
/**
 * Control Plane enforcement outcome.
 * Interpreted later by the dispatcher (Phase 30.4).
 */
var ControlPlaneEnforcement;
(function (ControlPlaneEnforcement) {
    ControlPlaneEnforcement["ALLOW"] = "ALLOW";
    ControlPlaneEnforcement["FORCE_DRY_RUN"] = "FORCE_DRY_RUN";
    ControlPlaneEnforcement["BLOCK"] = "BLOCK";
})(ControlPlaneEnforcement || (exports.ControlPlaneEnforcement = ControlPlaneEnforcement = {}));
/**
 * Control Plane scope.
 * Defines the blast radius of a control.
 */
var ControlPlaneScope;
(function (ControlPlaneScope) {
    /**
     * Applies to all admin actions system-wide.
     */
    ControlPlaneScope["GLOBAL"] = "GLOBAL";
    /**
     * Applies to a specific admin action key.
     */
    ControlPlaneScope["ACTION"] = "ACTION";
    /**
     * Emergency override.
     * Highest priority, evaluated first.
     */
    ControlPlaneScope["EMERGENCY"] = "EMERGENCY";
})(ControlPlaneScope || (exports.ControlPlaneScope = ControlPlaneScope = {}));
/**
 * Fail-closed default.
 * Used when:
 * - DB lookup fails
 * - Repository throws
 * - Inconsistent data detected
 */
exports.FAIL_CLOSED_EVALUATION = {
    enforcement: ControlPlaneEnforcement.BLOCK,
};
