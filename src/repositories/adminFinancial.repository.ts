import { Payment } from "../models/payment.model";
import { Refund } from "../models/refund.model";
import { Settlement } from "../models/settlement.model";
import { CreatorBalance } from "../models/creatorBalance.model";
import { Withdrawal } from "../models/withdrawal.model";
import { Payout } from "../models/payout.model";
import { Booking } from "../models/booking.model";
import { BookingFundReservation } from "../models/bookingFundReservation.model";
import { BookingEscrowAllocation } from "../models/bookingEscrowAllocation.model";
import { BookingCreatorSettlement } from "../models/bookingCreatorSettlement.model";

export class AdminFinancialRepository {
  private page(input: any) { const page = Math.max(1, Number(input.page) || 1); const limit = Math.min(100, Math.max(1, Number(input.limit) || 25)); return { page, limit, skip: (page - 1) * limit }; }
  async list(model: any, filter: Record<string, unknown>, input: any) { const { page, limit, skip } = this.page(input); const [items, total] = await Promise.all([model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), model.countDocuments(filter)]); return { items, pagination: { page, limit, total } }; }
  payments(input: any) { return this.list(Payment, this.filter(input, ["status", "provider", "currency", "bookingId", "userId", "creatorId"]), input); }
  payment(reference: string) { return Payment.findOne({ paymentReference: reference }).select("-providerPayload -attributes").lean(); }
  async paymentFinancialDetail(reference: string) {
    const payment = await this.payment(reference);
    if (!payment) return null;
    const [booking, reservation, escrow, settlement] = await Promise.all([
      Booking.findById(payment.bookingId).select("bookingReference status paymentMethod completedAt settlementEligibleAt").lean(),
      BookingFundReservation.findOne({ paymentId: payment._id }).select("reservationReference status amount currency authorizedAt releasedAt releaseReference releaseCause capturedAt captureReference captureCause").lean(),
      BookingEscrowAllocation.findOne({ paymentId: payment._id }).select("allocationReference status allocatedAt").lean(),
      BookingCreatorSettlement.findOne({ paymentId: payment._id }).select("settlementReference status settledAt").lean(),
    ]);
    return { payment, booking, reservation, escrow, settlement };
  }
  refunds(input: any) { return this.list(Refund, this.filter(input, ["status", "provider", "currency", "paymentId", "bookingId", "userId", "creatorId"]), input); }
  refund(reference: string) { return Refund.findOne({ refundReference: reference }).select("-providerPayload -attributes").lean(); }
  settlements(input: any) { return this.list(Settlement, this.filter(input, ["status", "currency", "creatorId", "paymentId", "bookingId"]), input); }
  settlement(reference: string) { return Settlement.findOne({ settlementReference: reference }).select("-attributes").lean(); }
  balances(input: any) { return this.list(CreatorBalance, this.filter(input, ["currency", "creatorId"]), input); }
  balance(creatorId: string) { return CreatorBalance.findOne({ creatorId }).lean(); }
  withdrawals(input: any) { return this.list(Withdrawal, this.filter(input, ["status", "currency", "creatorId", "isActiveObligation"]), input); }
  withdrawal(reference: string) { return Withdrawal.findOne({ withdrawalReference: reference }).select("-destinationSnapshot.encryptedPayload -attributes").lean(); }
  payouts(input: any) { return this.list(Payout, this.filter(input, ["status", "currency", "provider", "creatorId", "withdrawalId"]), input); }
  payout(reference: string) { return Payout.findOne({ payoutReference: reference }).select("-providerPayload -attributes").lean(); }
  async overview() { const byStatus = async (model: any) => model.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]); const [payments, refunds, settlements, withdrawals, payouts, balances] = await Promise.all([byStatus(Payment), byStatus(Refund), byStatus(Settlement), byStatus(Withdrawal), byStatus(Payout), CreatorBalance.aggregate([{ $group: { _id: "$currency", available: { $sum: "$availableBalance" }, reserved: { $sum: "$reservedBalance" }, locked: { $sum: "$lockedBalance" } } }])]); return { payments, refunds, settlements, withdrawals, payouts, creatorBalanceProjectionByCurrency: balances }; }
  private filter(input: any, fields: string[]) { const filter: Record<string, unknown> = {}; for (const field of fields) if (input[field] !== undefined) filter[field] = input[field]; if (input.dateFrom || input.dateTo) filter.createdAt = { ...(input.dateFrom ? { $gte: new Date(String(input.dateFrom)) } : {}), ...(input.dateTo ? { $lte: new Date(String(input.dateTo)) } : {}) }; return filter; }
}
export const adminFinancialRepository = new AdminFinancialRepository();
