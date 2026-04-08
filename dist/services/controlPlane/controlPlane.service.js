"use strict";
//backend/src/rervices/controlPlane/controlPlane.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPlaneService = void 0;
const controlPlane_repository_1 = require("./controlPlane.repository");
const controlPlane_types_1 = require("../../types/controlPlane.types");
/**
 * Control Plane Service
 *
 * This service defines how runtime controls are resolved.
 * It does NOT enforce behavior — it only evaluates state.
 */
class ControlPlaneService {
    /**
     * Resolve the control plane outcome for a given admin action.
     *
     * Evaluation order (highest priority first):
     * 1. EMERGENCY
     * 2. ACTION-specific
     * 3. GLOBAL
     *
     * Fail-closed if repository access fails.
     */
    static async evaluateForAction(actionKey) {
        let controls;
        try {
            controls = await controlPlane_repository_1.ControlPlaneRepository.fetchActiveControls();
        }
        catch (error) {
            return controlPlane_types_1.FAIL_CLOSED_EVALUATION;
        }
        if (!controls.length) {
            return { enforcement: controlPlane_types_1.ControlPlaneEnforcement.ALLOW };
        }
        // 1. Emergency controls
        const emergency = controls.find((c) => c.scope === controlPlane_types_1.ControlPlaneScope.EMERGENCY);
        if (emergency) {
            return {
                enforcement: emergency.enforcement,
                control: emergency,
            };
        }
        // 2. Action-specific controls
        const actionControl = controls.find((c) => c.scope === controlPlane_types_1.ControlPlaneScope.ACTION &&
            c.target === actionKey);
        if (actionControl) {
            return {
                enforcement: actionControl.enforcement,
                control: actionControl,
            };
        }
        // 3. Global controls
        const globalControl = controls.find((c) => c.scope === controlPlane_types_1.ControlPlaneScope.GLOBAL);
        if (globalControl) {
            return {
                enforcement: globalControl.enforcement,
                control: globalControl,
            };
        }
        return { enforcement: controlPlane_types_1.ControlPlaneEnforcement.ALLOW };
    }
    /**
     * Fetch all active controls.
     * Used later for UI, diagnostics, observability.
     */
    static async listActiveControls() {
        try {
            return await controlPlane_repository_1.ControlPlaneRepository.fetchActiveControls();
        }
        catch {
            return [];
        }
    }
}
exports.ControlPlaneService = ControlPlaneService;
