"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminFinancialService = exports.AdminFinancialService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const adminFinancial_repository_1 = require("../../repositories/adminFinancial.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const refund_repository_1 = require("../../repositories/refund.repository");
const settlement_repository_1 = require("../../repositories/settlement.repository");
const withdrawal_repository_1 = require("../../repositories/withdrawal.repository");
const payout_repository_1 = require("../../repositories/payout.repository");
const paymentLifecycle_service_1 = require("../financial/paymentLifecycle.service");
const bookingFinancialSettlement_service_1 = require("../financial/bookingFinancialSettlement.service");
const withdrawalPayoutLifecycle_service_1 = require("../financial/withdrawalPayoutLifecycle.service");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const adminActor = (id) => ({ type: "ADMIN", id: new mongoose_1.default.Types.ObjectId(id) });
class AdminFinancialService {
    constructor() {
        this.read = adminFinancial_repository_1.adminFinancialRepository;
    }
    getOverview() { return this.read.overview(); }
    getPayments(input) { return this.read.payments(input); }
    getPayment(reference) { return this.read.payment(reference); }
    async getPaymentFinancialDetail(reference) {
        const detail = await this.read.paymentFinancialDetail(reference);
        if (!detail)
            throw new Error("Payment not found");
        return detail;
    }
    getRefunds(input) { return this.read.refunds(input); }
    getRefund(reference) { return this.read.refund(reference); }
    getSettlements(input) { return this.read.settlements(input); }
    getSettlement(reference) { return this.read.settlement(reference); }
    getCreatorBalances(input) { return this.read.balances(input); }
    getCreatorBalance(creatorId) { return this.read.balance(creatorId); }
    getWithdrawals(input) { return this.read.withdrawals(input); }
    getWithdrawal(reference) { return this.read.withdrawal(reference); }
    getPayouts(input) { return this.read.payouts(input); }
    getPayout(reference) { return this.read.payout(reference); }
    async syncPayment(reference, adminId) { const payment = await payment_repository_1.paymentRepository.findByPaymentReference(reference); if (!payment)
        throw new Error("Payment not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_PAYMENT_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "PAYMENT", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency }, transition: { outcome: "PROCESSING" } }); const result = await paymentLifecycle_service_1.paymentLifecycleService.adminSynchronizePayment(payment._id.toString()); return { operation: "PAYMENT_SYNC", result: result.status === payment.status ? "ALREADY_SYNCHRONIZED" : "SYNCHRONIZED", payment: result }; }
    async syncRefund(reference, adminId) { const refund = await refund_repository_1.refundRepository.findByRefundReference(reference); if (!refund)
        throw new Error("Refund not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_REFUND_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, amount: refund.amount, currency: refund.currency }, transition: { outcome: "REPLAYED" } }); return { operation: "REFUND_SYNC", result: "NO_SYNCHRONIZATION_ACTION_AVAILABLE", refund }; }
    async recheckSettlement(reference, adminId) { const settlement = await settlement_repository_1.settlementRepository.findBySettlementReference(reference); if (!settlement)
        throw new Error("Settlement not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_SETTLEMENT_RECHECK_REQUESTED, actor: adminActor(adminId), entityType: "SETTLEMENT", entityId: settlement._id, financialContext: { domain: "SETTLEMENT", primaryReference: settlement.settlementReference, settlementReference: settlement.settlementReference, amount: settlement.amount, currency: settlement.currency }, transition: { outcome: "PROCESSING" } }); const result = await bookingFinancialSettlement_service_1.bookingFinancialSettlementService.settleBooking(settlement.bookingId.toString()); return { operation: "SETTLEMENT_RECHECK", result: result.replay ? "ALREADY_SETTLED" : "SETTLED", settlement: result.settlement }; }
    async processWithdrawal(reference, adminId) { const withdrawal = await withdrawal_repository_1.withdrawalRepository.findByReference(reference); if (!withdrawal)
        throw new Error("Withdrawal not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_WITHDRAWAL_PROCESS_REQUESTED, actor: adminActor(adminId), entityType: "WITHDRAWAL", entityId: withdrawal._id, financialContext: { domain: "WITHDRAWAL", primaryReference: withdrawal.withdrawalReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency }, transition: { outcome: "PROCESSING" } }); const prepared = await withdrawalPayoutLifecycle_service_1.withdrawalPayoutLifecycleService.initializeReservedWithdrawalPayout(withdrawal._id.toString()); const completed = await withdrawalPayoutLifecycle_service_1.withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(withdrawal._id.toString()); return { operation: "WITHDRAWAL_PROCESS", result: completed.withdrawal.status === withdrawal.status ? "ALREADY_PROCESSING" : "EXECUTED", withdrawal: completed.withdrawal, payout: completed.payout ?? prepared.payout }; }
    async syncPayout(reference, adminId) { const payout = await payout_repository_1.payoutRepository.findByPayoutReference(reference); if (!payout || !payout.withdrawalId)
        throw new Error("Withdrawal payout not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_PAYOUT_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, amount: payout.amount, currency: payout.currency }, transition: { outcome: "PROCESSING" } }); const result = await withdrawalPayoutLifecycle_service_1.withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(payout.withdrawalId.toString()); return { operation: "PAYOUT_SYNC", result: result.payout.status === payout.status ? "ALREADY_SYNCHRONIZED" : "SYNCHRONIZED", ...result }; }
    async synchronizeWithdrawal(reference, adminId) { const withdrawal = await withdrawal_repository_1.withdrawalRepository.findByReference(reference); if (!withdrawal)
        throw new Error("Withdrawal not found"); await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ADMIN_WITHDRAWAL_SYNC_REQUESTED, actor: adminActor(adminId), entityType: "WITHDRAWAL", entityId: withdrawal._id, financialContext: { domain: "WITHDRAWAL", primaryReference: withdrawal.withdrawalReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency }, transition: { outcome: "PROCESSING" } }); const result = await withdrawalPayoutLifecycle_service_1.withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(withdrawal._id.toString()); return { operation: "WITHDRAWAL_SYNC", result: "EXECUTED", withdrawal: result.withdrawal, payout: result.payout }; }
}
exports.AdminFinancialService = AdminFinancialService;
exports.adminFinancialService = new AdminFinancialService();
