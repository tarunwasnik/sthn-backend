"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escrowRecognitionService = exports.EscrowRecognitionService = void 0;
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const payment_repository_1 = require("../../repositories/payment.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const ledger_service_1 = require("./ledger.service");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
/** The sole Phase 5B authority for immutable capture-to-escrow postings. */
class EscrowRecognitionService {
    async recognizeCapturedPayment(payment, session) {
        if (!session.inTransaction()) {
            throw new PaymentError_1.PaymentError("Escrow recognition requires an active financial transaction.", "ESCROW_POSTING_FAILED");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED) {
            throw new PaymentError_1.PaymentError("Only captured payments may be recognized in escrow.", "ESCROW_POSTING_FAILED");
        }
        if (!payment.grossEscrowAmount || payment.grossEscrowAmount !== payment.amount || !payment.serviceAmount || payment.customerFeeAmount === undefined || !payment.pricingPolicy) {
            throw new PaymentError_1.PaymentError("Captured payment is missing a valid pricing snapshot.", "INVALID_PRICING_SNAPSHOT");
        }
        const transactionId = `escrow-capture:${payment.paymentReference}`;
        const debitKey = `${transactionId}:customer-debit`;
        const creditKey = `${transactionId}:escrow-credit`;
        const existingDebit = await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(debitKey, session);
        const existingCredit = await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(creditKey, session);
        if (payment.escrowRecognizedAt) {
            if (!existingDebit || !existingCredit || payment.escrowLedgerTransactionReference !== transactionId) {
                throw new PaymentError_1.PaymentError("Payment escrow marker does not match immutable ledger evidence.", "ESCROW_POSTING_FAILED");
            }
            return payment;
        }
        if (Boolean(existingDebit) !== Boolean(existingCredit)) {
            throw new PaymentError_1.PaymentError("Escrow ledger operation is incomplete and requires financial review.", "ESCROW_POSTING_FAILED");
        }
        const newlyRecognized = !existingCredit;
        if (newlyRecognized) {
            await ledger_service_1.ledgerService.createDebit({
                type: ledgerEntryType_enum_1.LedgerEntryType.PAYMENT,
                source: ledgerSource_enum_1.LedgerSource.PAYMENT,
                account: ledgerAccount_enum_1.LedgerAccount.CUSTOMER_CAPTURE,
                postingKey: debitKey,
                transactionId,
                bookingId: payment.bookingId.toString(),
                paymentId: payment._id.toString(),
                userId: payment.userId.toString(),
                money: { amount: payment.grossEscrowAmount, currency: payment.currency },
                description: "Captured customer funds transferred to platform escrow",
                idempotencyKey: transactionId,
            }, session);
            await ledger_service_1.ledgerService.createCredit({
                type: ledgerEntryType_enum_1.LedgerEntryType.PAYMENT,
                source: ledgerSource_enum_1.LedgerSource.PAYMENT,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
                postingKey: creditKey,
                transactionId,
                bookingId: payment.bookingId.toString(),
                paymentId: payment._id.toString(),
                userId: payment.userId.toString(),
                money: { amount: payment.grossEscrowAmount, currency: payment.currency },
                description: "Full gross customer payment recognized in platform escrow",
                idempotencyKey: transactionId,
            }, session);
        }
        const marked = await payment_repository_1.paymentRepository.markEscrowRecognized(payment._id, transactionId, new Date(), session);
        if (marked) {
            if (newlyRecognized)
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.ESCROW_FUNDS_RECOGNIZED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "ESCROW", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.grossEscrowAmount, currency: payment.currency, ledgerTransactionReference: transactionId }, transition: { outcome: "SUCCEEDED" }, session });
            return marked;
        }
        const current = await payment_repository_1.paymentRepository.findById(payment._id, session);
        if (!current?.escrowRecognizedAt || current.escrowLedgerTransactionReference !== transactionId) {
            throw new PaymentError_1.PaymentError("Escrow recognition conflicted.", "ESCROW_ALREADY_RECOGNIZED");
        }
        return current;
    }
    async recognizeFullRefund(payment, session) {
        if (!payment.escrowRecognizedAt || !payment.escrowLedgerTransactionReference || !payment.grossEscrowAmount) {
            // Pre-Phase-5B payments have no proven escrow posting. Historical
            // reconciliation deliberately decides whether they can enter escrow.
            return;
        }
        const transactionId = `escrow-refund:${payment.paymentReference}`;
        const debitKey = `${transactionId}:escrow-debit`;
        if (await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(debitKey, session))
            return;
        await ledger_service_1.ledgerService.createDebit({
            type: ledgerEntryType_enum_1.LedgerEntryType.REFUND, source: ledgerSource_enum_1.LedgerSource.REFUND,
            account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW, postingKey: debitKey, transactionId,
            bookingId: payment.bookingId.toString(), paymentId: payment._id.toString(), userId: payment.userId.toString(),
            money: { amount: payment.grossEscrowAmount, currency: payment.currency },
            description: "Full refund removes captured funds from platform escrow", idempotencyKey: transactionId,
        }, session);
        await ledger_service_1.ledgerService.createCredit({
            type: ledgerEntryType_enum_1.LedgerEntryType.REFUND, source: ledgerSource_enum_1.LedgerSource.REFUND,
            account: ledgerAccount_enum_1.LedgerAccount.CUSTOMER_REFUND, postingKey: `${transactionId}:customer-credit`, transactionId,
            bookingId: payment.bookingId.toString(), paymentId: payment._id.toString(), userId: payment.userId.toString(),
            money: { amount: payment.grossEscrowAmount, currency: payment.currency },
            description: "Full refund returned from platform escrow to customer", idempotencyKey: transactionId,
        }, session);
    }
}
exports.EscrowRecognitionService = EscrowRecognitionService;
exports.escrowRecognitionService = new EscrowRecognitionService();
