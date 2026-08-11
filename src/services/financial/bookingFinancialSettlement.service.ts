import mongoose from "mongoose";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { SettlementCreatorBalanceProjectionOperation } from "../../models/settlementCreatorBalanceProjectionOperation.model";
import { paymentRepository } from "../../repositories/payment.repository";
import { settlementRepository } from "../../repositories/settlement.repository";
import { creatorBalanceRepository } from "../../repositories/creatorBalance.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { ledgerService } from "./ledger.service";
import { calculateSettlement } from "./settlementCalculation.service";
import { SettlementStatus } from "../../enums/financial/settlementStatus.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { SettlementError } from "../../errors/financial/SettlementError";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";

export class BookingFinancialSettlementService {
  async settleBooking(bookingId: string) {
    const session = await mongoose.startSession(); let outcome: any;
    try { await session.withTransaction(async () => {
      const booking = await Booking.findById(bookingId).session(session); if (!booking) throw new SettlementError("Booking not found.", "SETTLEMENT_NOT_ELIGIBLE");
      if (booking.status !== "COMPLETED" || !booking.completedAt || !booking.settlementEligibleAt || booking.settlementEligibleAt > new Date() || booking.isFinancialLocked) throw new SettlementError("Booking is not eligible for settlement.", "SETTLEMENT_NOT_ELIGIBLE");
      if (await Dispute.exists({ bookingId: booking._id, status: "OPEN" }).session(session)) throw new SettlementError("Open dispute blocks settlement.", "SETTLEMENT_NOT_ELIGIBLE");
      if (!booking.paymentId) throw new SettlementError("Booking payment is missing.", "ESCROW_NOT_FOUND");
      const payment = await paymentRepository.findById(booking.paymentId, session);
      if (!payment || payment.status !== PaymentStatus.CAPTURED || payment.automaticSettlementBlocked) throw new SettlementError("Payment is not eligible for settlement.", "SETTLEMENT_NOT_ELIGIBLE");
      const calculation = calculateSettlement({ serviceAmount: payment.serviceAmount!, customerFeeAmount: payment.customerFeeAmount!, grossEscrowAmount: payment.grossEscrowAmount!, currency: payment.currency, pricingPolicy: payment.pricingPolicy!, pricingVersion: payment.pricingVersion!, paymentAmount: payment.amount });
      const { currency: _calculationCurrency, ...calculationFields } = calculation;
      const obligationKey = `booking-settlement:${booking._id.toString()}`;
      let settlement = await settlementRepository.findByFinancialObligationKey(obligationKey, session);
      if (settlement?.status === SettlementStatus.COMPLETED) { await createFinancialAudit({ action: AuditAction.SETTLEMENT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "settlement-job" }, entityType: "SETTLEMENT", entityId: settlement._id, financialContext: { domain: "SETTLEMENT", primaryReference: settlement.settlementReference, settlementReference: settlement.settlementReference, paymentReference: payment.paymentReference, amount: settlement.amount, currency: settlement.currency }, transition: { outcome: "REPLAYED" }, session }); outcome = { settlement, replay: true }; return; }
      if (settlement && settlement.paymentId.toString() !== payment._id.toString()) throw new SettlementError("Settlement obligation conflicts.", "SETTLEMENT_ALREADY_RUNNING");
      const captureTx = `escrow-capture:${payment.paymentReference}`;
      const capture = await ledgerEntryRepository.findByPostingKey(`${captureTx}:escrow-credit`, session);
      const captureDebit = await ledgerEntryRepository.findByPostingKey(`${captureTx}:customer-debit`, session);
      if (!capture || !captureDebit || capture.amount !== calculation.grossEscrowAmount || capture.currency !== payment.currency) throw new SettlementError("Escrow is not proven.", "ESCROW_NOT_FOUND");
      const priorDebits = await (await import("../../models/ledgerEntry.model")).LedgerEntry.aggregate([{ $match: { paymentId: payment._id, account: LedgerAccount.PLATFORM_ESCROW, direction: "DEBIT" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
      if ((priorDebits[0]?.total ?? 0) !== 0) throw new SettlementError("Escrow is not fully available.", "SETTLEMENT_NOT_ELIGIBLE");
      if (!settlement) settlement = await settlementRepository.create({ settlementReference: generateFinancialReference("SETTLEMENT"), bookingId: booking._id, paymentId: payment._id, userId: payment.userId, creatorId: payment.creatorId, amount: calculation.grossEscrowAmount, currency: payment.currency, status: SettlementStatus.PROCESSING, provider: PaymentProvider.INTERNAL, attemptNumber: 1, retryable: false, idempotencyKey: obligationKey, financialObligationKey: obligationKey, ...calculationFields, ledgerTransactionReference: `settlement:${obligationKey}` }, session);
      const tx = settlement.ledgerTransactionReference!;
      const legs = [
        ["escrow-debit", "DEBIT", LedgerAccount.PLATFORM_ESCROW, calculation.grossEscrowAmount],
        ["creator-credit", "CREDIT", LedgerAccount.CREATOR_AVAILABLE, calculation.creatorNetAmount],
        ["customer-fee-credit", "CREDIT", LedgerAccount.PLATFORM_CUSTOMER_FEE_REVENUE, calculation.customerFeeAmount],
        ["commission-credit", "CREDIT", LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE, calculation.platformCommissionAmount],
      ] as const;
      for (const [key, direction, account, amount] of legs) await ledgerService.createEntry({ type: LedgerEntryType.SETTLEMENT, source: LedgerSource.SETTLEMENT, direction: direction as any, account, postingKey: `${tx}:${key}`, transactionId: tx, bookingId: booking._id.toString(), paymentId: payment._id.toString(), settlementId: settlement._id.toString(), userId: payment.creatorId.toString(), money: { amount, currency: payment.currency }, idempotencyKey: tx }, session);
      const projection = await SettlementCreatorBalanceProjectionOperation.findOne({ settlementId: settlement._id }).session(session);
      if (!projection) {
        await SettlementCreatorBalanceProjectionOperation.create([{ settlementId: settlement._id, creatorId: payment.creatorId, amount: calculation.creatorNetAmount, currency: payment.currency }], { session });
        const balance = await creatorBalanceRepository.creditAvailableForSettlement(payment.creatorId.toString(), payment.currency, calculation.creatorNetAmount, session);
        if (!balance) throw new SettlementError("Creator balance is unavailable.", "CREATOR_BALANCE_FAILURE");
      }
      const completed = await settlementRepository.updateById(settlement._id.toString(), { status: SettlementStatus.COMPLETED, settledAt: new Date() }, session); if (!completed) throw new SettlementError("Settlement completion conflicted.");
      await Booking.updateOne({ _id: booking._id, settlementId: { $exists: false } }, { $set: { settlementId: completed._id, settledAt: completed.settledAt } }, { session });
      await createFinancialAudit({ action: AuditAction.SETTLEMENT_COMPLETED, actor: { type: "SYSTEM", reference: "settlement-job" }, entityType: "SETTLEMENT", entityId: completed._id, financialContext: { domain: "SETTLEMENT", primaryReference: completed.settlementReference, settlementReference: completed.settlementReference, paymentReference: payment.paymentReference, amount: completed.amount, currency: completed.currency, ledgerTransactionReference: tx, projectionOperationReference: `settlement:${completed._id}:creator-balance` }, transition: { fromStatus: SettlementStatus.PROCESSING, toStatus: SettlementStatus.COMPLETED, outcome: "SUCCEEDED" }, session });
      outcome = { settlement: completed, replay: false };
    }); } finally { await session.endSession(); }
    return outcome;
  }
}
export const bookingFinancialSettlementService = new BookingFinancialSettlementService();
