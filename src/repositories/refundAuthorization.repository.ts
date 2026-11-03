import { ClientSession, Types } from "mongoose";
import { RefundAuthorization, RefundAuthorizationDocument } from "../models/refundAuthorization.model";
import { Booking } from "../models/booking.model";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";
import { Refund } from "../models/refund.model";
import { TerminationProviderOperation } from "../models/terminationProviderOperation.model";
import { RefundStatus } from "../enums/financial/refundStatus.enum";

export class RefundAuthorizationRepository {
  findByDecision(authority: string, decisionId: string, session?: ClientSession) { return RefundAuthorization.findOne({ authority, decisionId }).select("+fingerprint").session(session ?? null).exec(); }
  findByRefundId(refundId: Types.ObjectId, session?: ClientSession) { return RefundAuthorization.findOne({ refundId }).session(session ?? null).exec(); }
  findCandidates(statuses: RefundStatus[], limit: number) { return Refund.find({ status: { $in: statuses } }).sort({ createdAt: 1, _id: 1 }).limit(limit).select("_id status").lean().exec(); }
  findGraph(bookingId: Types.ObjectId, paymentId: Types.ObjectId, session: ClientSession) {
    return Promise.all([Booking.findById(bookingId).session(session).exec(), Payment.findById(paymentId).session(session).exec(), PaymentOperation.findOne({ paymentId }).select("+userId +idempotencyKey").session(session).exec()]);
  }
  activeRefundTotal(paymentId: Types.ObjectId, session: ClientSession) {
    return Refund.aggregate([
      { $match: { paymentId, status: { $in: [RefundStatus.CREATED, RefundStatus.PENDING, RefundStatus.APPROVED, RefundStatus.PROCESSING, RefundStatus.COMPLETED, RefundStatus.PARTIALLY_COMPLETED] } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]).session(session);
  }
  findTerminationOperation(id: Types.ObjectId, session: ClientSession) { return TerminationProviderOperation.findById(id).session(session).exec(); }
  fencePayment(paymentId: Types.ObjectId, bookingId: Types.ObjectId, providerPaymentId: string, amount: number, currency: string, session: ClientSession) {
    return Payment.updateOne({ _id: paymentId, bookingId, status: "CAPTURED", providerPaymentId, amount, currency }, { $inc: { dispositionDispatchFence: 1 } }, { session }).exec();
  }
  createAuthorization(data: Partial<RefundAuthorizationDocument>, session: ClientSession) { return new RefundAuthorization(data).save({ session }); }
  createRefund(data: Record<string, unknown>, session: ClientSession) { return new Refund(data).save({ session }); }
  claimRefundDispatch(refundId: Types.ObjectId, session: ClientSession) { return Refund.findOneAndUpdate({ _id: refundId, status: RefundStatus.APPROVED, providerRefundId: { $exists: false } }, { $set: { status: RefundStatus.PROCESSING } }, { new: true, session, runValidators: true }).exec(); }
  recordRefundProviderResult(refundId: Types.ObjectId, expected: RefundStatus[], update: Record<string, unknown>) { return Refund.findOneAndUpdate({ _id: refundId, status: { $in: expected } }, { $set: update }, { new: true, runValidators: true, writeConcern: { w: "majority" } }).exec(); }
}
export const refundAuthorizationRepository = new RefundAuthorizationRepository();
