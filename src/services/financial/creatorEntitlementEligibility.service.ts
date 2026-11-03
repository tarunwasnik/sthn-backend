import mongoose, { Types } from "mongoose";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { creatorEntitlementRepository as repository } from "../../repositories/creatorEntitlement.repository";

export const CREATOR_ENTITLEMENT_NORMAL_HOLD_MS = 48 * 60 * 60 * 1000;
export const CREATOR_ENTITLEMENT_POST_RESOLUTION_HOLD_MS = 24 * 60 * 60 * 1000;

export type CreatorEntitlementEligibilityResult = {
  entitlementId: string;
  state: "HELD" | "ELIGIBLE";
  eligibleAt?: Date;
  reason?: "NOT_DUE" | "FINANCIAL_RESTRICTION" | "DISPUTE_OPEN" | "APPEAL_OPEN" | "FINANCIAL_ALLOCATION_UNRESOLVED" | "INTEGRITY";
  replayed: boolean;
};

/**
 * Evaluates one immutable provider-funded entitlement. It never authorizes a
 * payout or changes the original allocation. Dispute outcomes without an
 * authoritative financial allocation remain held by design.
 */
export class CreatorEntitlementEligibilityService {
  async evaluate(input: { entitlementId: string; now?: Date }): Promise<CreatorEntitlementEligibilityResult> {
    if (!Types.ObjectId.isValid(input.entitlementId)) throw new Error("Invalid creator entitlement id.");
    const now = input.now ?? new Date();
    const session = await mongoose.startSession();
    try {
      let result: CreatorEntitlementEligibilityResult | undefined;
      await session.withTransaction(async () => {
        const entitlement = await repository.findForEligibility(new Types.ObjectId(input.entitlementId), session);
        if (!entitlement) throw new Error("Creator entitlement not found.");
        const [booking, payment, operation, dispute] = await repository.findEligibilityEvidence(entitlement.bookingId, entitlement.paymentId, session);
        if (!booking || !payment || !operation || booking.status !== "COMPLETED" || !booking.completedAt || booking.isFinancialLocked ||
          booking.paymentMethod === PaymentMethod.WALLET || !booking.paymentId?.equals(payment._id) || payment.bookingId.toString() !== String(booking._id) ||
          payment.status !== PaymentStatus.CAPTURED || operation.status !== PaymentOperationStatus.CONFIRMED || operation.providerStatus !== "CAPTURED" || !operation.confirmedAt ||
          !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) || operation.provider !== payment.provider || operation.providerPaymentId !== payment.providerPaymentId ||
          payment.amount !== entitlement.totalAmount || payment.currency !== entitlement.currency || booking.currency !== entitlement.currency ||
          !entitlement.creatorId.equals(booking.creatorId) || !entitlement.paymentId.equals(payment._id)) {
          result = { entitlementId: String(entitlement._id), state: "HELD", reason: booking?.isFinancialLocked ? "FINANCIAL_RESTRICTION" : "INTEGRITY", replayed: true };
          return;
        }
        const normalEligibleAt = new Date(booking.completedAt.getTime() + CREATOR_ENTITLEMENT_NORMAL_HOLD_MS);
        let effectiveEligibleAt = normalEligibleAt;
        if (dispute) {
          const appeal = await repository.findAppeal(dispute._id, session);
          if (appeal?.status === "OPEN") {
            result = { entitlementId: String(entitlement._id), state: "HELD", reason: "APPEAL_OPEN", replayed: true };
            return;
          }
          if (dispute.status === "OPEN") {
            result = { entitlementId: String(entitlement._id), state: "HELD", reason: "DISPUTE_OPEN", replayed: true };
            return;
          }
          const allocation = await repository.findFinancialAllocation(dispute._id, appeal?._id, session);
          if (!allocation || !allocation.entitlementId.equals(entitlement._id) || !allocation.bookingId.equals(booking._id) || !allocation.paymentId.equals(payment._id) ||
            !allocation.creatorId.equals(entitlement.creatorId) || allocation.currency !== entitlement.currency || allocation.totalAmount !== entitlement.totalAmount ||
            allocation.approvedCreatorAmount < 0 || allocation.approvedCreatorAmount > entitlement.creatorAmount ||
            allocation.approvedCreatorAmount + allocation.approvedCustomerRefundAmount + allocation.platformAmount !== entitlement.totalAmount) {
            result = { entitlementId: String(entitlement._id), state: "HELD", reason: "FINANCIAL_ALLOCATION_UNRESOLVED", replayed: true };
            return;
          }
          effectiveEligibleAt = new Date(Math.max(normalEligibleAt.getTime(), allocation.finalizedAt.getTime() + CREATOR_ENTITLEMENT_POST_RESOLUTION_HOLD_MS));
        }
        if (entitlement.state === "ELIGIBLE") {
          result = { entitlementId: String(entitlement._id), state: "ELIGIBLE", eligibleAt: entitlement.eligibleAt, replayed: true };
          return;
        }
        if (now.getTime() < effectiveEligibleAt.getTime()) {
          result = { entitlementId: String(entitlement._id), state: "HELD", reason: "NOT_DUE", replayed: true };
          return;
        }
        const transitioned = await repository.transitionToEligible(entitlement._id, effectiveEligibleAt, session);
        if (!transitioned) {
          const winner = await repository.findForEligibility(entitlement._id, session);
          if (!winner || winner.state !== "ELIGIBLE") throw new Error("Creator entitlement eligibility transition conflicted.");
          result = { entitlementId: String(winner._id), state: "ELIGIBLE", eligibleAt: winner.eligibleAt, replayed: true };
          return;
        }
        result = { entitlementId: String(transitioned._id), state: "ELIGIBLE", eligibleAt: transitioned.eligibleAt, replayed: false };
      });
      if (!result) throw new Error("Creator entitlement eligibility evaluation did not commit.");
      return result;
    } finally { await session.endSession(); }
  }

  async evaluateHeld(limit = 50, now = new Date()) {
    const held = await repository.findHeld(limit);
    const results: CreatorEntitlementEligibilityResult[] = [];
    for (const entitlement of held) results.push(await this.evaluate({ entitlementId: String(entitlement._id), now }));
    return results;
  }
}

export const creatorEntitlementEligibilityService = new CreatorEntitlementEligibilityService();
