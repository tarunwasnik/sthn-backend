"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminFinancialRepository = exports.AdminFinancialRepository = void 0;
const payment_model_1 = require("../models/payment.model");
const refund_model_1 = require("../models/refund.model");
const settlement_model_1 = require("../models/settlement.model");
const creatorBalance_model_1 = require("../models/creatorBalance.model");
const withdrawal_model_1 = require("../models/withdrawal.model");
const payout_model_1 = require("../models/payout.model");
const booking_model_1 = require("../models/booking.model");
const bookingFundReservation_model_1 = require("../models/bookingFundReservation.model");
const bookingEscrowAllocation_model_1 = require("../models/bookingEscrowAllocation.model");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
class AdminFinancialRepository {
    page(input) { const page = Math.max(1, Number(input.page) || 1); const limit = Math.min(100, Math.max(1, Number(input.limit) || 25)); return { page, limit, skip: (page - 1) * limit }; }
    async list(model, filter, input) { const { page, limit, skip } = this.page(input); const [items, total] = await Promise.all([model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), model.countDocuments(filter)]); return { items, pagination: { page, limit, total } }; }
    payments(input) { return this.list(payment_model_1.Payment, this.filter(input, ["status", "provider", "currency", "bookingId", "userId", "creatorId"]), input); }
    payment(reference) { return payment_model_1.Payment.findOne({ paymentReference: reference }).select("-providerPayload -attributes").lean(); }
    async paymentFinancialDetail(reference) {
        const payment = await this.payment(reference);
        if (!payment)
            return null;
        const [booking, reservation, escrow, settlement] = await Promise.all([
            booking_model_1.Booking.findById(payment.bookingId).select("bookingReference status paymentMethod completedAt settlementEligibleAt").lean(),
            bookingFundReservation_model_1.BookingFundReservation.findOne({ paymentId: payment._id }).select("reservationReference status amount currency authorizedAt releasedAt releaseReference releaseCause capturedAt captureReference captureCause").lean(),
            bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ paymentId: payment._id }).select("allocationReference status allocatedAt").lean(),
            bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ paymentId: payment._id }).select("settlementReference status settledAt").lean(),
        ]);
        return { payment, booking, reservation, escrow, settlement };
    }
    refunds(input) { return this.list(refund_model_1.Refund, this.filter(input, ["status", "provider", "currency", "paymentId", "bookingId", "userId", "creatorId"]), input); }
    refund(reference) { return refund_model_1.Refund.findOne({ refundReference: reference }).select("-providerPayload -attributes").lean(); }
    settlements(input) { return this.list(settlement_model_1.Settlement, this.filter(input, ["status", "currency", "creatorId", "paymentId", "bookingId"]), input); }
    settlement(reference) { return settlement_model_1.Settlement.findOne({ settlementReference: reference }).select("-attributes").lean(); }
    balances(input) { return this.list(creatorBalance_model_1.CreatorBalance, this.filter(input, ["currency", "creatorId"]), input); }
    balance(creatorId) { return creatorBalance_model_1.CreatorBalance.findOne({ creatorId }).lean(); }
    withdrawals(input) { return this.list(withdrawal_model_1.Withdrawal, this.filter(input, ["status", "currency", "creatorId", "isActiveObligation"]), input); }
    withdrawal(reference) { return withdrawal_model_1.Withdrawal.findOne({ withdrawalReference: reference }).select("-destinationSnapshot.encryptedPayload -attributes").lean(); }
    payouts(input) { return this.list(payout_model_1.Payout, this.filter(input, ["status", "currency", "provider", "creatorId", "withdrawalId"]), input); }
    payout(reference) { return payout_model_1.Payout.findOne({ payoutReference: reference }).select("-providerPayload -attributes").lean(); }
    async overview() { const byStatus = async (model) => model.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]); const [payments, refunds, settlements, withdrawals, payouts, balances] = await Promise.all([byStatus(payment_model_1.Payment), byStatus(refund_model_1.Refund), byStatus(settlement_model_1.Settlement), byStatus(withdrawal_model_1.Withdrawal), byStatus(payout_model_1.Payout), creatorBalance_model_1.CreatorBalance.aggregate([{ $group: { _id: "$currency", available: { $sum: "$availableBalance" }, reserved: { $sum: "$reservedBalance" }, locked: { $sum: "$lockedBalance" } } }])]); return { payments, refunds, settlements, withdrawals, payouts, creatorBalanceProjectionByCurrency: balances }; }
    filter(input, fields) { const filter = {}; for (const field of fields)
        if (input[field] !== undefined)
            filter[field] = input[field]; if (input.dateFrom || input.dateTo)
        filter.createdAt = { ...(input.dateFrom ? { $gte: new Date(String(input.dateFrom)) } : {}), ...(input.dateTo ? { $lte: new Date(String(input.dateTo)) } : {}) }; return filter; }
}
exports.AdminFinancialRepository = AdminFinancialRepository;
exports.adminFinancialRepository = new AdminFinancialRepository();
