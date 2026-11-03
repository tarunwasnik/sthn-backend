import { ClientSession, Types } from "mongoose";
import { Booking } from "../models/booking.model";
import { CreatorEntitlement } from "../models/creatorEntitlement.model";
import { CreatorPayoutAuthorization, CreatorPayoutAuthorizationDocument } from "../models/creatorPayoutAuthorization.model";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";
import { Payout } from "../models/payout.model";
import { PayoutDestination } from "../models/payoutDestination.model";
import { Dispute } from "../models/dispute.model";
import { Appeal } from "../models/appeal.model";
import { CreatorEntitlementFinancialAllocation } from "../models/creatorEntitlementFinancialAllocation.model";

export class CreatorPayoutAuthorizationRepository {
  findByDecision(authority: string, decisionId: string, session?: ClientSession) {
    return CreatorPayoutAuthorization.findOne({ authority, decisionId }).select("+fingerprint").session(session ?? null).exec();
  }

  findGraph(entitlementId: Types.ObjectId, session: ClientSession) {
    return CreatorEntitlement.findById(entitlementId).session(session).exec();
  }

  findBookingPaymentAndOperation(bookingId: Types.ObjectId, paymentId: Types.ObjectId, session: ClientSession) {
    return Promise.all([
      Booking.findById(bookingId).session(session).exec(),
      Payment.findById(paymentId).session(session).exec(),
      PaymentOperation.findOne({ paymentId }).select("+userId +idempotencyKey").session(session).exec(),
    ]);
  }

  findDestination(destinationId: Types.ObjectId, session: ClientSession) {
    return PayoutDestination.findById(destinationId).session(session).exec();
  }

  async findCurrentFinancialAuthority(bookingId: Types.ObjectId, session: ClientSession) {
    const dispute = await Dispute.findOne({ bookingId }).session(session).exec();
    if (!dispute) return { dispute: null, appeal: null, allocation: null };
    const appeal = await Appeal.findOne({ disputeId: dispute._id }).session(session).exec();
    if (appeal?.status === "OPEN" || dispute.status === "OPEN") return { dispute, appeal, allocation: null };
    const allocation = await CreatorEntitlementFinancialAllocation.findOne(appeal
      ? { authority: "APPEAL_FINAL_DECISION_V1", decisionId: String(appeal._id) }
      : { authority: "DISPUTE_FINAL_DECISION_V1", decisionId: String(dispute._id) }).session(session).exec();
    return { dispute, appeal, allocation };
  }

  fencePayment(paymentId: Types.ObjectId, bookingId: Types.ObjectId, session: ClientSession) {
    return Payment.updateOne({ _id: paymentId, bookingId, status: "CAPTURED" }, { $inc: { dispositionDispatchFence: 1 } }, { session }).exec();
  }

  createPayout(data: Record<string, unknown>, session: ClientSession) { return new Payout(data).save({ session }); }
  createAuthorization(data: Partial<CreatorPayoutAuthorizationDocument>, session: ClientSession) { return new CreatorPayoutAuthorization(data).save({ session }); }
}

export const creatorPayoutAuthorizationRepository = new CreatorPayoutAuthorizationRepository();
