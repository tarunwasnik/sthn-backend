"use strict";
// backend/src/constants/internalProvider/providerPayoutSimulationAction.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderPayoutSimulationAction = void 0;
/**
 * Trusted commands accepted by the admin-only Internal Provider payout
 * simulator. These are commands, not provider payout statuses.
 */
var ProviderPayoutSimulationAction;
(function (ProviderPayoutSimulationAction) {
    ProviderPayoutSimulationAction["PROCESS"] = "PROCESS";
    ProviderPayoutSimulationAction["COMPLETE"] = "COMPLETE";
    ProviderPayoutSimulationAction["FAIL"] = "FAIL";
    ProviderPayoutSimulationAction["CANCEL"] = "CANCEL";
    ProviderPayoutSimulationAction["EXPIRE"] = "EXPIRE";
})(ProviderPayoutSimulationAction || (exports.ProviderPayoutSimulationAction = ProviderPayoutSimulationAction = {}));
exports.default = ProviderPayoutSimulationAction;
