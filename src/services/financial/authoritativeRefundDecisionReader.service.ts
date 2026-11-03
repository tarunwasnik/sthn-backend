import { ClientSession } from "mongoose";
import { RefundReason } from "../../enums/financial/refundReason.enum";
import { Payment } from "../../models/payment.model";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { Appeal } from "../../models/appeal.model";
import { CreatorEntitlementFinancialAllocation } from "../../models/creatorEntitlementFinancialAllocation.model";
import { AuthorizedRefundDecision, AuthorizedRefundDecisionReader } from "./refundAuthorization.service";

/** Reads only the currently-final Phase 7E allocation; it never executes a refund. */
export class AuthoritativeRefundDecisionReader implements AuthorizedRefundDecisionReader {
  async readAuthorized(authority: string, decisionId: string, session: ClientSession): Promise<AuthorizedRefundDecision | null> {
    if (authority === "TERMINAL_LATE_CAPTURE_V1") {
      const booking = await Booking.findById(decisionId).session(session).exec();
      if (!booking || !["CANCELLED", "REJECTED", "EXPIRED"].includes(booking.status) || !booking.paymentId) return null;
      const payment = await Payment.findById(booking.paymentId).session(session).exec();
      if (!payment?.providerPaymentId || payment.status !== "CAPTURED" || payment.bookingId.toString() !== booking._id.toString() || payment.userId.toString() !== booking.userId.toString() || payment.creatorId.toString() !== booking.creatorId.toString() || payment.amount !== booking.totalAmount || payment.currency !== booking.currency) return null;
      const reason = booking.status === "EXPIRED" ? RefundReason.BOOKING_EXPIRED : booking.status === "REJECTED" ? RefundReason.BOOKING_REJECTED : RefundReason.USER_CANCELLATION;
      return { authority, decisionId, policyVersion: "TERMINAL_LATE_CAPTURE_V1", bookingId: booking._id, paymentId: payment._id, customerId: booking.userId, creatorId: booking.creatorId, provider: payment.provider, providerPaymentId: payment.providerPaymentId, currency: payment.currency, amount: payment.amount, reason };
    }
    if (authority !== "DISPUTE_FINAL_DECISION_V1" && authority !== "APPEAL_FINAL_DECISION_V1") return null;
    const allocation = await CreatorEntitlementFinancialAllocation.findOne({ authority, decisionId }).session(session).exec();
    if (!allocation || allocation.approvedCustomerRefundAmount <= 0) return null;
    const dispute = await Dispute.findById(allocation.disputeId).session(session).exec();
    if (!dispute || dispute.status === "OPEN") return null;
    const appeal = await Appeal.findOne({ disputeId: dispute._id }).session(session).exec();
    if (appeal?.status === "OPEN") return null;
    const currentAuthority = appeal ? "APPEAL_FINAL_DECISION_V1" : "DISPUTE_FINAL_DECISION_V1";
    if (authority !== currentAuthority || (appeal && decisionId !== String(appeal._id)) || (!appeal && decisionId !== String(dispute._id))) return null;
    const payment = await Payment.findById(allocation.paymentId).session(session).exec();
    if (!payment || !payment.providerPaymentId || !payment.bookingId.equals(allocation.bookingId) || !payment.userId.equals(allocation.customerId) || !payment.creatorId.equals(allocation.creatorId) || payment.currency !== allocation.currency || allocation.approvedCustomerRefundAmount > payment.amount) return null;
    return { authority, decisionId, policyVersion: "FINANCIAL_ALLOCATION_V1", bookingId: allocation.bookingId, paymentId: payment._id, customerId: allocation.customerId, creatorId: allocation.creatorId, provider: payment.provider, providerPaymentId: payment.providerPaymentId, currency: payment.currency, amount: allocation.approvedCustomerRefundAmount, reason: RefundReason.DISPUTE_RESOLUTION };
  }
}
export const authoritativeRefundDecisionReader = new AuthoritativeRefundDecisionReader();
