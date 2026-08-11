import mongoose from "mongoose";

import { IPayment } from "../../models/payment.model";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { paymentRepository } from "../../repositories/payment.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { ledgerService } from "./ledger.service";
import { PaymentError } from "../../errors/financial/PaymentError";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";

/** The sole Phase 5B authority for immutable capture-to-escrow postings. */
export class EscrowRecognitionService {
  async recognizeCapturedPayment(
    payment: IPayment,
    session: mongoose.ClientSession,
  ): Promise<IPayment> {
    if (!session.inTransaction()) {
      throw new PaymentError("Escrow recognition requires an active financial transaction.", "ESCROW_POSTING_FAILED");
    }
    if (payment.status !== PaymentStatus.CAPTURED) {
      throw new PaymentError("Only captured payments may be recognized in escrow.", "ESCROW_POSTING_FAILED");
    }
    if (!payment.grossEscrowAmount || payment.grossEscrowAmount !== payment.amount || !payment.serviceAmount || payment.customerFeeAmount === undefined || !payment.pricingPolicy) {
      throw new PaymentError("Captured payment is missing a valid pricing snapshot.", "INVALID_PRICING_SNAPSHOT");
    }
    const transactionId = `escrow-capture:${payment.paymentReference}`;
    const debitKey = `${transactionId}:customer-debit`;
    const creditKey = `${transactionId}:escrow-credit`;
    const existingDebit = await ledgerEntryRepository.findByPostingKey(debitKey, session);
    const existingCredit = await ledgerEntryRepository.findByPostingKey(creditKey, session);
    if (payment.escrowRecognizedAt) {
      if (!existingDebit || !existingCredit || payment.escrowLedgerTransactionReference !== transactionId) {
        throw new PaymentError("Payment escrow marker does not match immutable ledger evidence.", "ESCROW_POSTING_FAILED");
      }
      return payment;
    }
    if (Boolean(existingDebit) !== Boolean(existingCredit)) {
      throw new PaymentError("Escrow ledger operation is incomplete and requires financial review.", "ESCROW_POSTING_FAILED");
    }
    const newlyRecognized = !existingCredit;
    if (newlyRecognized) {
      await ledgerService.createDebit({
        type: LedgerEntryType.PAYMENT,
        source: LedgerSource.PAYMENT,
        account: LedgerAccount.CUSTOMER_CAPTURE,
        postingKey: debitKey,
        transactionId,
        bookingId: payment.bookingId.toString(),
        paymentId: payment._id.toString(),
        userId: payment.userId.toString(),
        money: { amount: payment.grossEscrowAmount, currency: payment.currency },
        description: "Captured customer funds transferred to platform escrow",
        idempotencyKey: transactionId,
      }, session);
      await ledgerService.createCredit({
        type: LedgerEntryType.PAYMENT,
        source: LedgerSource.PAYMENT,
        account: LedgerAccount.PLATFORM_ESCROW,
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

    const marked = await paymentRepository.markEscrowRecognized(
      payment._id,
      transactionId,
      new Date(),
      session,
    );
    if (marked) {
      if (newlyRecognized) await createFinancialAudit({ action: AuditAction.ESCROW_FUNDS_RECOGNIZED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "ESCROW", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.grossEscrowAmount, currency: payment.currency, ledgerTransactionReference: transactionId }, transition: { outcome: "SUCCEEDED" }, session });
      return marked;
    }
    const current = await paymentRepository.findById(payment._id, session);
    if (!current?.escrowRecognizedAt || current.escrowLedgerTransactionReference !== transactionId) {
      throw new PaymentError("Escrow recognition conflicted.", "ESCROW_ALREADY_RECOGNIZED");
    }
    return current;
  }

  async recognizeFullRefund(
    payment: IPayment,
    session: mongoose.ClientSession,
  ): Promise<void> {
    if (!payment.escrowRecognizedAt || !payment.escrowLedgerTransactionReference || !payment.grossEscrowAmount) {
      // Pre-Phase-5B payments have no proven escrow posting. Historical
      // reconciliation deliberately decides whether they can enter escrow.
      return;
    }
    const transactionId = `escrow-refund:${payment.paymentReference}`;
    const debitKey = `${transactionId}:escrow-debit`;
    if (await ledgerEntryRepository.findByPostingKey(debitKey, session)) return;
    await ledgerService.createDebit({
      type: LedgerEntryType.REFUND, source: LedgerSource.REFUND,
      account: LedgerAccount.PLATFORM_ESCROW, postingKey: debitKey, transactionId,
      bookingId: payment.bookingId.toString(), paymentId: payment._id.toString(), userId: payment.userId.toString(),
      money: { amount: payment.grossEscrowAmount, currency: payment.currency },
      description: "Full refund removes captured funds from platform escrow", idempotencyKey: transactionId,
    }, session);
    await ledgerService.createCredit({
      type: LedgerEntryType.REFUND, source: LedgerSource.REFUND,
      account: LedgerAccount.CUSTOMER_REFUND, postingKey: `${transactionId}:customer-credit`, transactionId,
      bookingId: payment.bookingId.toString(), paymentId: payment._id.toString(), userId: payment.userId.toString(),
      money: { amount: payment.grossEscrowAmount, currency: payment.currency },
      description: "Full refund returned from platform escrow to customer", idempotencyKey: transactionId,
    }, session);
  }
}

export const escrowRecognitionService = new EscrowRecognitionService();
