import mongoose from "mongoose";
import { adminFinancialRepository } from "../../repositories/adminFinancial.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { refundRepository } from "../../repositories/refund.repository";
import { settlementRepository } from "../../repositories/settlement.repository";
import { withdrawalRepository } from "../../repositories/withdrawal.repository";
import { payoutRepository } from "../../repositories/payout.repository";
import { paymentLifecycleService } from "../financial/paymentLifecycle.service";
import { bookingFinancialSettlementService } from "../financial/bookingFinancialSettlement.service";
import { withdrawalPayoutLifecycleService } from "../financial/withdrawalPayoutLifecycle.service";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";

const adminActor = (id: string) => ({ type: "ADMIN" as const, id: new mongoose.Types.ObjectId(id) });
export class AdminFinancialService {
  readonly read = adminFinancialRepository;
  getOverview() { return this.read.overview(); }
  getPayments(input: any) { return this.read.payments(input); }
  getPayment(reference: string) { return this.read.payment(reference); }
  getRefunds(input: any) { return this.read.refunds(input); }
  getRefund(reference: string) { return this.read.refund(reference); }
  getSettlements(input: any) { return this.read.settlements(input); }
  getSettlement(reference: string) { return this.read.settlement(reference); }
  getCreatorBalances(input: any) { return this.read.balances(input); }
  getCreatorBalance(creatorId: string) { return this.read.balance(creatorId); }
  getWithdrawals(input: any) { return this.read.withdrawals(input); }
  getWithdrawal(reference: string) { return this.read.withdrawal(reference); }
  getPayouts(input: any) { return this.read.payouts(input); }
  getPayout(reference: string) { return this.read.payout(reference); }
  async syncPayment(reference: string, adminId: string) { const payment = await paymentRepository.findByPaymentReference(reference); if (!payment) throw new Error("Payment not found"); await createFinancialAudit({ action: AuditAction.ADMIN_PAYMENT_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "PAYMENT", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency }, transition: { outcome: "PROCESSING" } }); const result = await paymentLifecycleService.adminSynchronizePayment(payment._id.toString()); return { operation: "PAYMENT_SYNC", result: result.status === payment.status ? "ALREADY_SYNCHRONIZED" : "SYNCHRONIZED", payment: result }; }
  async syncRefund(reference: string, adminId: string) { const refund = await refundRepository.findByRefundReference(reference); if (!refund) throw new Error("Refund not found"); await createFinancialAudit({ action: AuditAction.ADMIN_REFUND_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, amount: refund.amount, currency: refund.currency }, transition: { outcome: "REPLAYED" } }); return { operation: "REFUND_SYNC", result: "NO_SYNCHRONIZATION_ACTION_AVAILABLE", refund }; }
  async recheckSettlement(reference: string, adminId: string) { const settlement = await settlementRepository.findBySettlementReference(reference); if (!settlement) throw new Error("Settlement not found"); await createFinancialAudit({ action: AuditAction.ADMIN_SETTLEMENT_RECHECK_REQUESTED, actor: adminActor(adminId), entityType: "SETTLEMENT", entityId: settlement._id, financialContext: { domain: "SETTLEMENT", primaryReference: settlement.settlementReference, settlementReference: settlement.settlementReference, amount: settlement.amount, currency: settlement.currency }, transition: { outcome: "PROCESSING" } }); const result = await bookingFinancialSettlementService.settleBooking(settlement.bookingId.toString()); return { operation: "SETTLEMENT_RECHECK", result: result.replay ? "ALREADY_SETTLED" : "SETTLED", settlement: result.settlement }; }
  async processWithdrawal(reference: string, adminId: string) { const withdrawal = await withdrawalRepository.findByReference(reference); if (!withdrawal) throw new Error("Withdrawal not found"); await createFinancialAudit({ action: AuditAction.ADMIN_WITHDRAWAL_PROCESS_REQUESTED, actor: adminActor(adminId), entityType: "WITHDRAWAL", entityId: withdrawal._id, financialContext: { domain: "WITHDRAWAL", primaryReference: withdrawal.withdrawalReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency }, transition: { outcome: "PROCESSING" } }); const prepared = await withdrawalPayoutLifecycleService.initializeReservedWithdrawalPayout(withdrawal._id.toString()); const completed = await withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(withdrawal._id.toString()); return { operation: "WITHDRAWAL_PROCESS", result: completed.withdrawal.status === withdrawal.status ? "ALREADY_PROCESSING" : "EXECUTED", withdrawal: completed.withdrawal, payout: completed.payout ?? prepared.payout }; }
  async syncPayout(reference: string, adminId: string) { const payout = await payoutRepository.findByPayoutReference(reference); if (!payout || !payout.withdrawalId) throw new Error("Withdrawal payout not found"); await createFinancialAudit({ action: AuditAction.ADMIN_PAYOUT_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, amount: payout.amount, currency: payout.currency }, transition: { outcome: "PROCESSING" } }); const result = await withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(payout.withdrawalId.toString()); return { operation: "PAYOUT_SYNC", result: result.payout.status === payout.status ? "ALREADY_SYNCHRONIZED" : "SYNCHRONIZED", ...result }; }
  async synchronizeWithdrawal(reference: string, adminId: string) { const withdrawal = await withdrawalRepository.findByReference(reference); if (!withdrawal) throw new Error("Withdrawal not found"); await createFinancialAudit({ action: AuditAction.ADMIN_WITHDRAWAL_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "WITHDRAWAL", entityId: withdrawal._id, financialContext: { domain: "WITHDRAWAL", primaryReference: withdrawal.withdrawalReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency }, transition: { outcome: "PROCESSING" } }); const result = await withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(withdrawal._id.toString()); return { operation: "WITHDRAWAL_SYNC", result: "EXECUTED", withdrawal: result.withdrawal, payout: result.payout }; }
}
export const adminFinancialService = new AdminFinancialService();
