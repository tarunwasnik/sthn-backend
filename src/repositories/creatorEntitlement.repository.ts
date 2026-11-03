import { ClientSession, Types } from "mongoose";
import { CreatorEntitlement, CreatorEntitlementDocument } from "../models/creatorEntitlement.model";
import { Booking } from "../models/booking.model";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";
import { Dispute } from "../models/dispute.model";
import { Appeal } from "../models/appeal.model";
import { CreatorEntitlementFinancialAllocation } from "../models/creatorEntitlementFinancialAllocation.model";

export class CreatorEntitlementRepository {
  findByDecision(decisionAuthority: string, decisionId: string, session?: ClientSession) {
    return CreatorEntitlement.findOne({ decisionAuthority, decisionId }).select("+fingerprint").session(session ?? null).exec();
  }
  findGraph(bookingId: Types.ObjectId, paymentId: Types.ObjectId, session: ClientSession) {
    return Promise.all([
      Booking.findById(bookingId).session(session).exec(),
      Payment.findById(paymentId).session(session).exec(),
      PaymentOperation.findOne({ paymentId }).select("+userId +idempotencyKey").session(session).exec(),
    ]);
  }
  create(data: Partial<CreatorEntitlementDocument>, session: ClientSession) { return new CreatorEntitlement(data).save({ session }); }
  findForEligibility(id: Types.ObjectId, session: ClientSession) {
    return CreatorEntitlement.findById(id).session(session).exec();
  }
  findEligibilityEvidence(bookingId: Types.ObjectId, paymentId: Types.ObjectId, session: ClientSession) {
    return Promise.all([
      Booking.findById(bookingId).session(session).exec(),
      Payment.findById(paymentId).session(session).exec(),
      PaymentOperation.findOne({ paymentId }).select("+userId +idempotencyKey").session(session).exec(),
      Dispute.findOne({ bookingId }).session(session).exec(),
    ]);
  }
  findAppeal(disputeId: Types.ObjectId, session: ClientSession) {
    return Appeal.findOne({ disputeId }).session(session).exec();
  }
  findFinancialAllocation(disputeId: Types.ObjectId, appealId: Types.ObjectId | undefined, session: ClientSession) {
    return CreatorEntitlementFinancialAllocation.findOne(appealId
      ? { authority: "APPEAL_FINAL_DECISION_V1", decisionId: String(appealId) }
      : { authority: "DISPUTE_FINAL_DECISION_V1", decisionId: String(disputeId) }).session(session).exec();
  }
  transitionToEligible(id: Types.ObjectId, eligibleAt: Date, session: ClientSession) {
    return CreatorEntitlement.findOneAndUpdate(
      { _id: id, state: "HELD", eligibleAt: { $exists: false } },
      { $set: { state: "ELIGIBLE", eligibleAt } },
      { new: true, runValidators: true, session },
    ).exec();
  }
  findHeld(limit: number) {
    return CreatorEntitlement.find({ state: "HELD" }, { _id: 1 }).sort({ createdAt: 1, _id: 1 }).limit(limit).lean().exec();
  }
}
export const creatorEntitlementRepository = new CreatorEntitlementRepository();
