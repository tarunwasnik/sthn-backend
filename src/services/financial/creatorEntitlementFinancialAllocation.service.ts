import crypto from "node:crypto";
import { ClientSession, Types } from "mongoose";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorEntitlementFinancialAllocation } from "../../models/creatorEntitlementFinancialAllocation.model";
import { Booking } from "../../models/booking.model";

export type FinancialAllocationInput = { creatorAmount: number; customerRefundAmount: number; platformAmount: number; reasonReference: string };
export class CreatorEntitlementFinancialAllocationError extends Error { constructor(message: string) { super(message); } }
const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const key = (value: FinancialAllocationInput) => crypto.createHash("sha256").update(JSON.stringify([value.creatorAmount, value.customerRefundAmount, value.platformAmount, value.reasonReference.trim()])).digest("hex");

/** Writes only an immutable decision; refund and payout authorization remain separate phases. */
export class CreatorEntitlementFinancialAllocationService {
  async record(input: { authority: "DISPUTE_FINAL_DECISION_V1" | "APPEAL_FINAL_DECISION_V1"; decisionId: string; bookingId: Types.ObjectId; disputeId: Types.ObjectId; appealId?: Types.ObjectId; decidedBy: Types.ObjectId; finalizedAt: Date; allocation: FinancialAllocationInput }, session: ClientSession) {
    const a = input.allocation;
    if (!valid(a.creatorAmount) || !valid(a.customerRefundAmount) || !valid(a.platformAmount) || typeof a.reasonReference !== "string" || !a.reasonReference.trim() || a.reasonReference.length > 4000) throw new CreatorEntitlementFinancialAllocationError("Invalid financial allocation.");
    const existing = await CreatorEntitlementFinancialAllocation.findOne({ authority: input.authority, decisionId: input.decisionId }).select("+fingerprint").session(session);
    const fingerprint = key(a);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new CreatorEntitlementFinancialAllocationError("Conflicting financial allocation for finalized decision.");
      return { allocation: existing, replayed: true };
    }
    const entitlement = await CreatorEntitlement.findOne({ bookingId: input.bookingId }).session(session);
    const booking = await Booking.findById(input.bookingId).session(session).select("userId").exec();
    if (!entitlement) throw new CreatorEntitlementFinancialAllocationError("Provider-funded creator entitlement not found.");
    if (!booking || !booking.userId) throw new CreatorEntitlementFinancialAllocationError("Booking customer identity is missing.");
    if (entitlement.currency === undefined || a.creatorAmount + a.customerRefundAmount + a.platformAmount !== entitlement.totalAmount || a.creatorAmount > entitlement.creatorAmount) {
      throw new CreatorEntitlementFinancialAllocationError("Financial allocation exceeds the original provider-funded obligation.");
    }
    const created = await CreatorEntitlementFinancialAllocation.create([{
      authority: input.authority, decisionId: input.decisionId, fingerprint, entitlementId: entitlement._id, bookingId: entitlement.bookingId, paymentId: entitlement.paymentId,
      disputeId: input.disputeId, appealId: input.appealId, creatorId: entitlement.creatorId, customerId: booking.userId,
      currency: entitlement.currency, totalAmount: entitlement.totalAmount, approvedCreatorAmount: a.creatorAmount, approvedCustomerRefundAmount: a.customerRefundAmount, platformAmount: a.platformAmount,
      decidedBy: input.decidedBy, finalizedAt: input.finalizedAt, reasonReference: a.reasonReference.trim(), version: 1,
    }], { session });
    return { allocation: created[0], replayed: false };
  }
}
export const creatorEntitlementFinancialAllocationService = new CreatorEntitlementFinancialAllocationService();
