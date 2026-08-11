"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.historicalFinancialReconciliationService = exports.HistoricalFinancialReconciliationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../../models/booking.model");
const payment_model_1 = require("../../models/payment.model");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentPricingPolicy_enum_1 = require("../../enums/financial/paymentPricingPolicy.enum");
const financialReconciliationStatus_enum_1 = require("../../enums/financial/financialReconciliationStatus.enum");
const financialReconciliationReason_enum_1 = require("../../enums/financial/financialReconciliationReason.enum");
const payment_repository_1 = require("../../repositories/payment.repository");
const paymentPricing_service_1 = require("./paymentPricing.service");
class HistoricalFinancialReconciliationService {
    async inspectPayment(payment) {
        const booking = await booking_model_1.Booking.findById(payment.bookingId).lean();
        if (!booking || !Number.isSafeInteger(booking.price) || booking.price < 1) {
            return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.MISSING_BOOKING_AMOUNT, "Booking service amount is unavailable.");
        }
        if (booking.currency !== payment.currency) {
            return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.CURRENCY_MISMATCH, "Booking and Payment currencies differ.");
        }
        if (![paymentStatus_enum_1.PaymentStatus.CAPTURED, paymentStatus_enum_1.PaymentStatus.REFUNDED, paymentStatus_enum_1.PaymentStatus.SETTLED].includes(payment.status)) {
            return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.PAYMENT_STATUS_UNSUPPORTED, "Payment is not in a captured financial state.");
        }
        if (payment.serviceAmount !== undefined || payment.customerFeeAmount !== undefined || payment.grossEscrowAmount !== undefined || payment.pricingPolicy) {
            try {
                paymentPricing_service_1.paymentPricingService.validateSnapshot({
                    serviceAmount: payment.serviceAmount, customerFeeRateBps: payment.customerFeeRateBps, customerFeeAmount: payment.customerFeeAmount,
                    grossEscrowAmount: payment.grossEscrowAmount, currency: payment.currency, pricingPolicy: payment.pricingPolicy, pricingVersion: payment.pricingVersion,
                });
                if (payment.amount !== payment.grossEscrowAmount)
                    return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.AMOUNT_MISMATCH, "Payment provider amount conflicts with gross pricing snapshot.");
                return {
                    paymentId: payment._id.toString(), status: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.FULLY_RECONCILED,
                    update: payment.escrowRecognizedAt
                        ? { reconciliationStatus: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.FULLY_RECONCILED, automaticSettlementBlocked: false }
                        : { reconciliationStatus: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.FULLY_RECONCILED, automaticSettlementBlocked: true,
                            reconciliationNote: "Pricing is coherent, but no proven escrow ledger posting exists." },
                };
            }
            catch {
                return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.AMOUNT_MISMATCH, "Existing pricing snapshot is inconsistent.");
            }
        }
        if (payment.amount === booking.price) {
            return {
                paymentId: payment._id.toString(), status: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.LEGACY_COMPATIBLE,
                update: { serviceAmount: booking.price, customerFeeRateBps: 0, customerFeeAmount: 0, grossEscrowAmount: payment.amount,
                    pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.LEGACY_NO_CUSTOMER_FEE, pricingVersion: 0, pricingCalculatedAt: payment.createdAt,
                    reconciliationStatus: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.LEGACY_COMPATIBLE,
                    automaticSettlementBlocked: true,
                    reconciliationNote: "Legacy pricing is coherent, but settlement remains blocked until escrow is proven or established manually." },
            };
        }
        return this.manual(payment, financialReconciliationReason_enum_1.FinancialReconciliationReason.AMOUNT_MISMATCH, "Captured amount cannot be reconciled to the persisted Booking price.");
    }
    manual(payment, reason, note) {
        return { paymentId: payment._id.toString(), status: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED, reason, note,
            update: { reconciliationStatus: financialReconciliationStatus_enum_1.FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED, reconciliationReason: reason, reconciliationNote: note, automaticSettlementBlocked: true } };
    }
    async reconcilePayment(payment, dryRun) {
        const plan = await this.inspectPayment(payment);
        if (!dryRun && plan.update) {
            const session = await mongoose_1.default.startSession();
            try {
                await session.withTransaction(async () => {
                    const updated = await payment_repository_1.paymentRepository.updateReconciliation(payment._id, plan.update, session);
                    if (!updated)
                        throw new Error("Historical reconciliation conflicted with an established payment snapshot.");
                });
            }
            finally {
                await session.endSession();
            }
        }
        return plan;
    }
    async reconcileBatch(input) {
        const report = { scanned: 0, unchanged: 0, fullyReconciled: 0, legacyCompatible: 0, manualReviewRequired: 0, skipped: 0, failed: 0, reasonCounts: {} };
        const filter = {};
        if (input.paymentId)
            filter._id = input.paymentId;
        if (input.bookingId)
            filter.bookingId = input.bookingId;
        const cursor = payment_model_1.Payment.find(filter).sort({ createdAt: 1 }).limit(input.limit).cursor();
        for await (const payment of cursor) {
            report.scanned += 1;
            try {
                const plan = await this.reconcilePayment(payment, input.dryRun);
                if (!plan.update)
                    report.unchanged += 1;
                if (plan.status === financialReconciliationStatus_enum_1.FinancialReconciliationStatus.FULLY_RECONCILED)
                    report.fullyReconciled += 1;
                if (plan.status === financialReconciliationStatus_enum_1.FinancialReconciliationStatus.LEGACY_COMPATIBLE)
                    report.legacyCompatible += 1;
                if (plan.status === financialReconciliationStatus_enum_1.FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED) {
                    report.manualReviewRequired += 1;
                    if (plan.reason)
                        report.reasonCounts[plan.reason] = (report.reasonCounts[plan.reason] ?? 0) + 1;
                }
            }
            catch {
                report.failed += 1;
            }
        }
        return report;
    }
}
exports.HistoricalFinancialReconciliationService = HistoricalFinancialReconciliationService;
exports.historicalFinancialReconciliationService = new HistoricalFinancialReconciliationService();
