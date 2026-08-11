// backend/src/constants/internalProvider/providerPayoutSimulationAction.enum.ts

/**
 * Trusted commands accepted by the admin-only Internal Provider payout
 * simulator. These are commands, not provider payout statuses.
 */
export enum ProviderPayoutSimulationAction {
  PROCESS = "PROCESS",
  COMPLETE = "COMPLETE",
  FAIL = "FAIL",
  CANCEL = "CANCEL",
  EXPIRE = "EXPIRE",
}

export default ProviderPayoutSimulationAction;
