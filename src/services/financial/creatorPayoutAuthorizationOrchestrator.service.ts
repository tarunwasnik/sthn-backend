import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorPayoutAuthorization } from "../../models/creatorPayoutAuthorization.model";

export type CreatorPayoutAuthorizationAttempt = { entitlementId: string; status: "ALREADY_AUTHORIZED" | "BLOCKED"; reason?: "PAYOUT_ROUTE_EVIDENCE_UNAVAILABLE" | "NO_VERIFIED_DESTINATION" };

/**
 * Discovers eligible provider-funded earnings. It deliberately does not infer
 * a destination country, funding route, fee, or FX evidence: those must be
 * verified before CreatorPayoutAuthorizationService can be invoked.
 */
export class CreatorPayoutAuthorizationOrchestrator {
  async evaluateEligible(limit = 50): Promise<CreatorPayoutAuthorizationAttempt[]> {
    const entitlements = await CreatorEntitlement.find({ state: "ELIGIBLE" }, { _id: 1, creatorId: 1 }).sort({ eligibleAt: 1, _id: 1 }).limit(limit).lean();
    const results: CreatorPayoutAuthorizationAttempt[] = [];
    for (const entitlement of entitlements) {
      const existing = await CreatorPayoutAuthorization.exists({ entitlementId: entitlement._id });
      if (existing) results.push({ entitlementId: String(entitlement._id), status: "ALREADY_AUTHORIZED" });
      else results.push({ entitlementId: String(entitlement._id), status: "BLOCKED", reason: "PAYOUT_ROUTE_EVIDENCE_UNAVAILABLE" });
    }
    return results;
  }
}
export const creatorPayoutAuthorizationOrchestrator = new CreatorPayoutAuthorizationOrchestrator();
