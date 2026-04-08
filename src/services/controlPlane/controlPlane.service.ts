//backend/src/rervices/controlPlane/controlPlane.service.ts

import { ControlPlaneRepository } from "./controlPlane.repository";
import {
  ControlPlaneEnforcement,
  ControlPlaneEvaluationResult,
  ControlPlaneRule,
  ControlPlaneScope,
  FAIL_CLOSED_EVALUATION,
} from "../../types/controlPlane.types";

/**
 * Control Plane Service
 *
 * This service defines how runtime controls are resolved.
 * It does NOT enforce behavior — it only evaluates state.
 */
export class ControlPlaneService {
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
  static async evaluateForAction(
    actionKey: string
  ): Promise<ControlPlaneEvaluationResult> {
    let controls: ControlPlaneRule[];

    try {
      controls = await ControlPlaneRepository.fetchActiveControls();
    } catch (error) {
      return FAIL_CLOSED_EVALUATION;
    }

    if (!controls.length) {
      return { enforcement: ControlPlaneEnforcement.ALLOW };
    }

    // 1. Emergency controls
    const emergency = controls.find(
      (c) => c.scope === ControlPlaneScope.EMERGENCY
    );
    if (emergency) {
      return {
        enforcement: emergency.enforcement,
        control: emergency,
      };
    }

    // 2. Action-specific controls
    const actionControl = controls.find(
      (c) =>
        c.scope === ControlPlaneScope.ACTION &&
        c.target === actionKey
    );
    if (actionControl) {
      return {
        enforcement: actionControl.enforcement,
        control: actionControl,
      };
    }

    // 3. Global controls
    const globalControl = controls.find(
      (c) => c.scope === ControlPlaneScope.GLOBAL
    );
    if (globalControl) {
      return {
        enforcement: globalControl.enforcement,
        control: globalControl,
      };
    }

    return { enforcement: ControlPlaneEnforcement.ALLOW };
  }

  /**
   * Fetch all active controls.
   * Used later for UI, diagnostics, observability.
   */
  static async listActiveControls(): Promise<ControlPlaneRule[]> {
    try {
      return await ControlPlaneRepository.fetchActiveControls();
    } catch {
      return [];
    }
  }
}
