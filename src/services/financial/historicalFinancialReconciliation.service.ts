import mongoose from "mongoose";
import { Booking } from "../../models/booking.model";
import { Payment, IPayment } from "../../models/payment.model";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentPricingPolicy } from "../../enums/financial/paymentPricingPolicy.enum";
import { FinancialReconciliationStatus } from "../../enums/financial/financialReconciliationStatus.enum";
import { FinancialReconciliationReason } from "../../enums/financial/financialReconciliationReason.enum";
import { paymentRepository } from "../../repositories/payment.repository";
import { paymentPricingService } from "./paymentPricing.service";

export interface ReconciliationPlan {
  paymentId: string;
  status: FinancialReconciliationStatus;
  reason?: FinancialReconciliationReason;
  note?: string;
  update?: Record<string, unknown>;
}

export interface ReconciliationReport {
  scanned: number; unchanged: number; fullyReconciled: number; legacyCompatible: number;
  manualReviewRequired: number; skipped: number; failed: number; reasonCounts: Record<string, number>;
}

export class HistoricalFinancialReconciliationService {
  async inspectPayment(payment: IPayment): Promise<ReconciliationPlan> {
    const booking = await Booking.findById(payment.bookingId).lean();
    if (!booking || !Number.isSafeInteger(booking.price) || booking.price < 1) {
      return this.manual(payment, FinancialReconciliationReason.MISSING_BOOKING_AMOUNT, "Booking service amount is unavailable.");
    }
    if (booking.currency !== payment.currency) {
      return this.manual(payment, FinancialReconciliationReason.CURRENCY_MISMATCH, "Booking and Payment currencies differ.");
    }
    if (![PaymentStatus.CAPTURED, PaymentStatus.REFUNDED, PaymentStatus.SETTLED].includes(payment.status)) {
      return this.manual(payment, FinancialReconciliationReason.PAYMENT_STATUS_UNSUPPORTED, "Payment is not in a captured financial state.");
    }
    if (payment.serviceAmount !== undefined || payment.customerFeeAmount !== undefined || payment.grossEscrowAmount !== undefined || payment.pricingPolicy) {
      try {
        paymentPricingService.validateSnapshot({
          serviceAmount: payment.serviceAmount!, customerFeeRateBps: payment.customerFeeRateBps!, customerFeeAmount: payment.customerFeeAmount!,
          grossEscrowAmount: payment.grossEscrowAmount!, currency: payment.currency, pricingPolicy: payment.pricingPolicy!, pricingVersion: payment.pricingVersion!,
        });
        if (payment.amount !== payment.grossEscrowAmount) return this.manual(payment, FinancialReconciliationReason.AMOUNT_MISMATCH, "Payment provider amount conflicts with gross pricing snapshot.");
        return {
          paymentId: payment._id.toString(), status: FinancialReconciliationStatus.FULLY_RECONCILED,
          update: payment.escrowRecognizedAt
            ? { reconciliationStatus: FinancialReconciliationStatus.FULLY_RECONCILED, automaticSettlementBlocked: false }
            : { reconciliationStatus: FinancialReconciliationStatus.FULLY_RECONCILED, automaticSettlementBlocked: true,
              reconciliationNote: "Pricing is coherent, but no proven escrow ledger posting exists." },
        };
      } catch {
        return this.manual(payment, FinancialReconciliationReason.AMOUNT_MISMATCH, "Existing pricing snapshot is inconsistent.");
      }
    }
    if (payment.amount === booking.price) {
      return {
        paymentId: payment._id.toString(), status: FinancialReconciliationStatus.LEGACY_COMPATIBLE,
        update: { serviceAmount: booking.price, customerFeeRateBps: 0, customerFeeAmount: 0, grossEscrowAmount: payment.amount,
          pricingPolicy: PaymentPricingPolicy.LEGACY_NO_CUSTOMER_FEE, pricingVersion: 0, pricingCalculatedAt: payment.createdAt,
          reconciliationStatus: FinancialReconciliationStatus.LEGACY_COMPATIBLE,
          automaticSettlementBlocked: true,
          reconciliationNote: "Legacy pricing is coherent, but settlement remains blocked until escrow is proven or established manually." },
      };
    }
    return this.manual(payment, FinancialReconciliationReason.AMOUNT_MISMATCH, "Captured amount cannot be reconciled to the persisted Booking price.");
  }

  private manual(payment: IPayment, reason: FinancialReconciliationReason, note: string): ReconciliationPlan {
    return { paymentId: payment._id.toString(), status: FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED, reason, note,
      update: { reconciliationStatus: FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED, reconciliationReason: reason, reconciliationNote: note, automaticSettlementBlocked: true } };
  }

  async reconcilePayment(payment: IPayment, dryRun: boolean): Promise<ReconciliationPlan> {
    const plan = await this.inspectPayment(payment);
    if (!dryRun && plan.update) {
      const session = await mongoose.startSession();
      try { await session.withTransaction(async () => {
        const updated = await paymentRepository.updateReconciliation(payment._id, plan.update!, session);
        if (!updated) throw new Error("Historical reconciliation conflicted with an established payment snapshot.");
      }); }
      finally { await session.endSession(); }
    }
    return plan;
  }

  async reconcileBatch(input: { dryRun: boolean; limit: number; paymentId?: string; bookingId?: string }): Promise<ReconciliationReport> {
    const report: ReconciliationReport = { scanned: 0, unchanged: 0, fullyReconciled: 0, legacyCompatible: 0, manualReviewRequired: 0, skipped: 0, failed: 0, reasonCounts: {} };
    const filter: Record<string, unknown> = {};
    if (input.paymentId) filter._id = input.paymentId;
    if (input.bookingId) filter.bookingId = input.bookingId;
    const cursor = Payment.find(filter).sort({ createdAt: 1 }).limit(input.limit).cursor();
    for await (const payment of cursor) {
      report.scanned += 1;
      try {
        const plan = await this.reconcilePayment(payment, input.dryRun);
        if (!plan.update) report.unchanged += 1;
        if (plan.status === FinancialReconciliationStatus.FULLY_RECONCILED) report.fullyReconciled += 1;
        if (plan.status === FinancialReconciliationStatus.LEGACY_COMPATIBLE) report.legacyCompatible += 1;
        if (plan.status === FinancialReconciliationStatus.MANUAL_REVIEW_REQUIRED) { report.manualReviewRequired += 1; if (plan.reason) report.reasonCounts[plan.reason] = (report.reasonCounts[plan.reason] ?? 0) + 1; }
      } catch { report.failed += 1; }
    }
    return report;
  }
}
export const historicalFinancialReconciliationService = new HistoricalFinancialReconciliationService();
