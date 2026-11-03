import { creatorEntitlementEligibilityService } from "../services/financial/creatorEntitlementEligibility.service";
import { creatorPayoutAuthorizationOrchestrator } from "../services/financial/creatorPayoutAuthorizationOrchestrator.service";

/** Durable discovery only; every entitlement is revalidated transactionally. */
export const evaluateCreatorEntitlementsJob = async () => {
  const results = await creatorEntitlementEligibilityService.evaluateHeld();
  const payoutAuthorization = await creatorPayoutAuthorizationOrchestrator.evaluateEligible();
  return {
    processed: results.length,
    eligible: results.filter((result) => result.state === "ELIGIBLE" && !result.replayed).length,
    held: results.filter((result) => result.state === "HELD").length,
    replayed: results.filter((result) => result.replayed).length,
    payoutAuthorization: { processed: payoutAuthorization.length, authorized: payoutAuthorization.filter((result) => result.status === "ALREADY_AUTHORIZED").length, blocked: payoutAuthorization.filter((result) => result.status === "BLOCKED").length },
  };
};
