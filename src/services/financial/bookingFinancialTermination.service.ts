import mongoose, { ClientSession } from "mongoose";

import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { BookingTerminationError } from "../../errors/booking/BookingTerminationError";
import { PaymentError } from "../../errors/financial/PaymentError";
import { bookingRepository } from "../../repositories/booking.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { TerminationEvidenceRequest } from "../../contracts/financial/paymentProvider.types";
import { IPayment } from "../../models/payment.model";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";
import { refundService } from "./refund.service";
import { Booking } from "../../models/booking.model";
import { IBooking, ITerminationEvidence } from "../../models/booking.model";
import { Slot } from "../../models/slot.model";
import { escrowRecognitionService } from "./escrowRecognition.service";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import {
  bookingWalletReleaseCauseForTermination,
  bookingWalletReservationReleaseService,
  SafeBookingWalletReleaseResult,
} from "./bookingWalletReservationRelease.service";
import { BookingWalletReservationReleaseError } from "../../errors/financial/BookingWalletReservationReleaseError";
import { createBookingNotifications, deliverCreatedBookingNotifications } from "../notification/bookingNotification.service";
import { terminationProviderOperationRepository as terminationOperations } from "../../repositories/terminationProviderOperation.repository";
import { ITerminationProviderOperation } from "../../models/terminationProviderOperation.model";
import { evaluateCancellationInteraction } from "./cancellationEvidence.service";
import { calculateCancellationDisposition } from "./cancellationDisposition.service";

export interface TerminateBookingFinanciallyInput {
  bookingId: string;
  actorType: BookingTerminationActorType;
  actorId?: string;
  terminationType: BookingTerminationType;
  reason?: string;
  /** Trusted server receipt, never populated from a request body. */
  receiptAt?: Date;
}

type FinancialAction = "NONE" | "CANCEL" | "REFUND" | "RELEASE";

export class BookingFinancialTerminationService {
  private operationKey(bookingId: string): string { return `booking-termination:${bookingId}`; }

  private async makeEvidence(input: TerminateBookingFinanciallyInput, receiptAt: Date | undefined, session?: ClientSession): Promise<ITerminationEvidence> {
    const validReceipt = receiptAt instanceof Date && Number.isFinite(receiptAt.getTime());
    const interaction = validReceipt
      ? await evaluateCancellationInteraction(new mongoose.Types.ObjectId(input.bookingId), receiptAt, session)
      : { outcome: "INSUFFICIENT_EVIDENCE" as const, reason: "ORIGINAL_RECEIPT_UNAVAILABLE", messageIds: [] };
    return { version: "TERMINATION_EVIDENCE_V1", status: "PENDING", operationKey: this.operationKey(new mongoose.Types.ObjectId(input.bookingId).toString()), receiptOrder: "UNVERIFIED",
      actorType: input.actorType, ...(input.actorId && mongoose.Types.ObjectId.isValid(input.actorId) ? { actorId: new mongoose.Types.ObjectId(input.actorId) } : {}),
      intent: input.terminationType, ...(validReceipt ? { receiptAt } : {}), outcome: interaction.outcome,
      reason: interaction.reason, candidateMessageIds: interaction.messageIds, recordedAt: new Date() };
  }

  private matchesEvidence(evidence: ITerminationEvidence, input: TerminateBookingFinanciallyInput): boolean {
    return evidence.operationKey === this.operationKey(new mongoose.Types.ObjectId(input.bookingId).toString()) && evidence.actorType === input.actorType &&
      evidence.intent === input.terminationType && String(evidence.actorId ?? "") === String(input.actorId ?? "");
  }

  private async preserveDisposition(booking: IBooking, evidence: ITerminationEvidence, session?: ClientSession): Promise<void> {
    let existing = (await bookingRepository.findCancellationDisposition(booking._id as mongoose.Types.ObjectId, session))?.cancellationDisposition;
    if (!existing) {
      const candidate = await calculateCancellationDisposition(booking, evidence, session);
      const written = await bookingRepository.admitCancellationDisposition(booking._id as mongoose.Types.ObjectId, candidate, session);
      existing = written?.cancellationDisposition ?? (await bookingRepository.findCancellationDisposition(booking._id as mongoose.Types.ObjectId, session))?.cancellationDisposition;
    }
    if (!existing || existing.operationKey !== evidence.operationKey || existing.intent !== evidence.intent || existing.actorType !== evidence.actorType || String(existing.actorId ?? "") !== String(evidence.actorId ?? "")) {
      throw new BookingTerminationError("Cancellation disposition identity conflicts.", "BOOKING_TERMINATION_CONFLICT", 409);
    }
  }

  private async verifiedEvidence(payment: IPayment, kind: TerminationEvidenceRequest["kind"], refundId?: string, providerOperationReference?: string) {
    if (!payment.providerPaymentId) throw new PaymentError("Provider payment reference is missing.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    const provider = paymentProviderRegistry.get(payment.provider);
    const evidence = await provider.getTerminationEvidence?.({ kind, paymentId: String(payment._id), providerPaymentId: payment.providerPaymentId, amount: { amount: payment.amount, currency: payment.currency }, refundId, providerOperationReference });
    if (!evidence || evidence.outcome === "UNKNOWN" || evidence.outcome === "UNSUPPORTED") throw new BookingTerminationError("Provider operation requires reconciliation.", "BOOKING_TERMINATION_CONFLICT", 409);
    if (evidence.outcome !== "VERIFIED" || evidence.kind !== kind || evidence.paymentId !== String(payment._id) || evidence.providerPaymentId !== payment.providerPaymentId || evidence.amount.amount !== payment.amount || evidence.amount.currency !== payment.currency || (kind === "REFUND" && (evidence.refundId !== refundId || evidence.providerOperationReference !== providerOperationReference))) throw new PaymentError("Provider evidence identity conflicts.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    if (kind !== "PAYMENT" && evidence.result !== "SUCCESS") throw new BookingTerminationError("Provider operation requires reconciliation.", "BOOKING_TERMINATION_CONFLICT", 409);
    return evidence;
  }

  /** R1A preparation only. Not called by live termination until R1B provides recovery. */
  async prepareTerminationClaim(input: TerminateBookingFinanciallyInput) {
    if (!mongoose.Types.ObjectId.isValid(input.bookingId)) throw new BookingTerminationError("Invalid booking id.", "BOOKING_NOT_FOUND", 400);
    const permitted = (input.actorType === BookingTerminationActorType.CUSTOMER && input.terminationType === BookingTerminationType.CUSTOMER_CANCELLED) ||
      (input.actorType === BookingTerminationActorType.CREATOR && [BookingTerminationType.CREATOR_CANCELLED, BookingTerminationType.CREATOR_REJECTED].includes(input.terminationType)) ||
      (input.actorType === BookingTerminationActorType.SYSTEM && input.terminationType === BookingTerminationType.BOOKING_EXPIRED);
    if (!permitted || (input.actorType !== BookingTerminationActorType.SYSTEM && (!input.actorId || !mongoose.Types.ObjectId.isValid(input.actorId)))) throw new BookingTerminationError("Invalid claim actor or intent.", "BOOKING_ACTOR_NOT_AUTHORIZED", 403);
    const booking = await Booking.findById(input.bookingId);
    await this.authorize(input, booking);
    if (!booking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
    // Full wallet and provider eligibility must be added by R1B before live use.
    if (booking.paymentId) throw new BookingTerminationError("Financial claim preparation requires provider recovery.", "BOOKING_TERMINATION_CONFLICT", 409);
    const now = new Date();
    const result = await bookingRepository.acquireTerminationClaim({ bookingId: booking._id as mongoose.Types.ObjectId, claim: {
      operationKey: this.operationKey(booking._id.toString()), status: "ACTIVE", intent: input.terminationType,
      actorType: input.actorType, ...(input.actorId ? { actorId: new mongoose.Types.ObjectId(input.actorId) } : {}),
      createdAt: now, updatedAt: now, version: 1,
    } });
    if (!result?.terminationClaim) throw new BookingTerminationError("Booking is ineligible or has a conflicting claim.", "BOOKING_TERMINATION_CONFLICT", 409);
    return result.terminationClaim;
  }

  private targetStatus(type: BookingTerminationType): "REJECTED" | "CANCELLED" | "EXPIRED" {
    if (type === BookingTerminationType.CREATOR_REJECTED) return "REJECTED";
    if (type === BookingTerminationType.BOOKING_EXPIRED) return "EXPIRED";
    return "CANCELLED";
  }

  private async authorize(input: TerminateBookingFinanciallyInput, booking: IBooking | null) {
    if (!booking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
    const validIdentity = (input.actorType === BookingTerminationActorType.CUSTOMER && input.terminationType === BookingTerminationType.CUSTOMER_CANCELLED) ||
      (input.actorType === BookingTerminationActorType.CREATOR && [BookingTerminationType.CREATOR_CANCELLED, BookingTerminationType.CREATOR_REJECTED].includes(input.terminationType)) ||
      (input.actorType === BookingTerminationActorType.SYSTEM && input.terminationType === BookingTerminationType.BOOKING_EXPIRED && !input.actorId) ||
      (input.actorType === BookingTerminationActorType.ADMIN && input.terminationType === BookingTerminationType.ADMIN_CANCELLED) ||
      (input.actorType === BookingTerminationActorType.GOVERNANCE && input.terminationType === BookingTerminationType.GOVERNANCE_TERMINATED);
    if (!validIdentity || (input.actorType !== BookingTerminationActorType.SYSTEM && (!input.actorId || !mongoose.Types.ObjectId.isValid(input.actorId)))) {
      throw new BookingTerminationError("Invalid termination actor or intent.", "BOOKING_ACTOR_NOT_AUTHORIZED", 403);
    }
    if ((input.actorType === BookingTerminationActorType.CUSTOMER && booking.userId.toString() !== input.actorId) ||
      (input.actorType === BookingTerminationActorType.CREATOR && booking.creatorId.toString() !== input.actorId)) {
      throw new BookingTerminationError("Actor is not authorized to terminate this booking.", "BOOKING_ACTOR_NOT_AUTHORIZED", 403);
    }
  }

  private actionFor(paymentStatus: PaymentStatus, providerStatus?: string): FinancialAction {
    if ([PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED, PaymentStatus.REFUNDED].includes(paymentStatus)) return "NONE";
    if (paymentStatus === PaymentStatus.SETTLED || paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) {
      throw new PaymentError("This Payment requires a later settlement or refund workflow.", "PAYMENT_TERMINATION_NOT_ALLOWED");
    }
    if (providerStatus === "CAPTURED" || paymentStatus === PaymentStatus.CAPTURED) return "REFUND";
    if (providerStatus === "REFUNDED") return "NONE";
    if (providerStatus === "CANCELLED") return "NONE";
    return "CANCEL";
  }

  async terminateBookingFinancially(input: TerminateBookingFinanciallyInput, _options?: { confirmedRecovery?: boolean }) {
    const receivedAt = input.terminationType === BookingTerminationType.CUSTOMER_CANCELLED || input.terminationType === BookingTerminationType.CREATOR_CANCELLED
      ? input.receiptAt : new Date();
    if (!mongoose.Types.ObjectId.isValid(input.bookingId)) throw new BookingTerminationError("Invalid booking id.", "BOOKING_NOT_FOUND", 400);
    const booking = await Booking.findById(input.bookingId);
    await this.authorize(input, booking);
    if (!booking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
    const existingClaim = (await bookingRepository.findTerminationClaim(booking._id as mongoose.Types.ObjectId))?.terminationClaim;
    if (existingClaim && (existingClaim.intent !== input.terminationType || existingClaim.actorType !== input.actorType || String(existingClaim.actorId ?? "") !== String(input.actorId ?? ""))) throw new BookingTerminationError("Conflicting termination claim.", "BOOKING_TERMINATION_CONFLICT", 409);
    const operationKey = this.operationKey(booking._id.toString());
    const targetStatus = this.targetStatus(input.terminationType);

    if (["CANCELLED", "REJECTED", "EXPIRED"].includes(booking.status)) {
      if (booking.terminationOperationKey === operationKey && booking.terminationType === input.terminationType) {
        const savedEvidence = (await bookingRepository.findTerminationEvidence(booking._id as mongoose.Types.ObjectId))?.terminationEvidence;
        if (savedEvidence && (savedEvidence.status !== "FINALIZED" || !this.matchesEvidence(savedEvidence, input))) throw new BookingTerminationError("Termination evidence identity conflicts.", "BOOKING_TERMINATION_CONFLICT", 409);
        const terminalPayment = booking.paymentId
          ? await paymentRepository.findById(booking.paymentId)
          : null;
        if (terminalPayment?.method === PaymentMethod.WALLET) {
          const cause = bookingWalletReleaseCauseForTermination(input.terminationType);
          if (!cause) {
            throw new BookingTerminationError(
              "This Wallet booking termination cause cannot release a reservation.",
              "BOOKING_TERMINATION_CONFLICT",
              409,
            );
          }
          const replay = await bookingWalletReservationReleaseService.validateReplay({
            bookingId: booking._id as mongoose.Types.ObjectId,
            cause,
          });
          return { ...replay, financialAction: "RELEASE" as FinancialAction, replay: true };
        }
        return { booking, payment: terminalPayment, financialAction: "NONE" as FinancialAction, replay: true };
      }
      throw new BookingTerminationError("Booking already has a conflicting terminal outcome.", "BOOKING_TERMINATION_CONFLICT", 409);
    }
    if (booking.status === "COMPLETED") throw new BookingTerminationError("Completed bookings cannot be terminated by this workflow.", "BOOKING_ALREADY_COMPLETED", 409);
    if (
      input.terminationType === BookingTerminationType.CREATOR_REJECTED &&
      booking.status !== "REQUESTED"
    ) {
      throw new BookingTerminationError(
        "Only a requested booking can be rejected.",
        "BOOKING_TERMINATION_CONFLICT",
        409,
      );
    }
    if (input.terminationType === BookingTerminationType.BOOKING_EXPIRED) {
      if (
        input.actorType !== BookingTerminationActorType.SYSTEM ||
        booking.status !== "REQUESTED" ||
        !booking.expiresAt ||
        booking.expiresAt.getTime() > Date.now()
      ) {
        throw new BookingTerminationError(
          "Only an expired requested booking can be expired by the system.",
          "BOOKING_TERMINATION_CONFLICT",
          409,
        );
      }
    }
    const payment = booking.paymentId ? await paymentRepository.findById(booking.paymentId) : null;
    if (payment && booking.paymentMethod !== payment.method) {
      throw new BookingWalletReservationReleaseError(
        "Booking and Payment method links are inconsistent.",
        "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT",
      );
    }
    if (payment && payment.method !== PaymentMethod.WALLET && !payment.providerPaymentId &&
        ![PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED].includes(payment.status)) {
      throw new BookingTerminationError("Payment outcome requires reconciliation before termination.", "BOOKING_TERMINATION_CONFLICT", 409);
    }
    const persistedRecovery = existingClaim?.status === "ACTIVE"
      ? await terminationOperations.findByClaimKey(this.operationKey(booking._id.toString()))
      : null;
    let action: FinancialAction = "NONE";
    let providerStatus: string | undefined;
    if (payment?.providerPaymentId) {
      providerStatus = (await this.verifiedEvidence(payment, "PAYMENT")).providerStatus;
    }
    const walletReleaseCause = payment?.method === PaymentMethod.WALLET
      ? bookingWalletReleaseCauseForTermination(input.terminationType)
      : null;
    if (payment?.method === PaymentMethod.WALLET) {
      if (!walletReleaseCause) {
        throw new BookingTerminationError(
          "This termination cause is not eligible for Wallet reservation release.",
          "BOOKING_TERMINATION_CONFLICT",
          409,
        );
      }
      action = "RELEASE";
    } else if (payment) {
      action = persistedRecovery ? persistedRecovery.kind : payment.provider === "RAZORPAY" && payment.providerPaymentId?.startsWith("order_") && providerStatus === "PENDING"
        ? "NONE" : this.actionFor(payment.status, providerStatus);
    }

    let recoveryOperation: ITerminationProviderOperation | null = null;
    let recoveryClaim = existingClaim;
    let terminationEvidence: ITerminationEvidence | undefined;
    if (payment && payment.method !== PaymentMethod.WALLET && payment.providerPaymentId && (action === "CANCEL" || action === "REFUND" || existingClaim?.status === "ACTIVE")) {
      if (!payment.bookingId.equals(booking._id) || !payment.userId.equals(booking.userId) || !payment.creatorId.equals(booking.creatorId) || payment.amount !== booking.totalAmount || payment.currency !== booking.currency) throw new PaymentError("Payment and booking identity conflict.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
      const actorId = input.actorId && mongoose.Types.ObjectId.isValid(input.actorId) ? new mongoose.Types.ObjectId(input.actorId) : undefined;
      const now = new Date();
      const evidenceReceiptAt = receivedAt instanceof Date && Number.isFinite(receivedAt.getTime()) ? receivedAt : undefined;
      const claimed = await bookingRepository.acquireTerminationClaim({ bookingId: booking._id as mongoose.Types.ObjectId, claim: { operationKey, status: "ACTIVE", intent: input.terminationType, actorType: input.actorType, actorId, paymentId: payment._id, evidenceReceiptAt, createdAt: now, updatedAt: now, version: 1 } });
      if (!claimed?.terminationClaim) throw new BookingTerminationError("Conflicting termination claim.", "BOOKING_TERMINATION_CONFLICT", 409);
      recoveryClaim = claimed.terminationClaim;
      recoveryOperation = persistedRecovery ?? await terminationOperations.findByClaimKey(operationKey);
      if (!recoveryOperation && (action === "CANCEL" || action === "REFUND")) {
        try { recoveryOperation = await terminationOperations.create({ bookingId: booking._id, paymentId: payment._id, claimKey: operationKey, intent: input.terminationType, actorType: input.actorType, actorId, provider: payment.provider, providerPaymentId: payment.providerPaymentId, kind: action, amount: payment.amount, currency: payment.currency, idempotencyKey: action === "REFUND" ? `${operationKey}:full-refund` : `${operationKey}:cancel` }); }
        catch (error) { recoveryOperation = await terminationOperations.findByClaimKey(operationKey); if (!recoveryOperation) throw error; }
      }
      if (!recoveryOperation || !recoveryOperation.bookingId.equals(booking._id) || !recoveryOperation.paymentId.equals(payment._id) || recoveryOperation.intent !== input.terminationType || recoveryOperation.actorType !== input.actorType || String(recoveryOperation.actorId ?? "") !== String(actorId ?? "") || recoveryOperation.provider !== payment.provider || recoveryOperation.providerPaymentId !== payment.providerPaymentId || recoveryOperation.amount !== payment.amount || recoveryOperation.currency !== payment.currency || recoveryOperation.idempotencyKey !== (recoveryOperation.kind === "REFUND" ? `${operationKey}:full-refund` : `${operationKey}:cancel`)) throw new BookingTerminationError("Provider operation identity conflicts.", "BOOKING_TERMINATION_CONFLICT", 409);
      let evidenceBooking = await bookingRepository.findTerminationEvidence(booking._id as mongoose.Types.ObjectId);
      if (!evidenceBooking?.terminationEvidence) {
        // A pre-existing claim without evidence may have lost its original receipt.
        const originalReceipt = recoveryClaim.evidenceReceiptAt;
        const pending = await this.makeEvidence(input, originalReceipt);
        evidenceBooking = await bookingRepository.admitTerminationEvidence(booking._id as mongoose.Types.ObjectId, pending) ??
          await bookingRepository.findTerminationEvidence(booking._id as mongoose.Types.ObjectId);
      }
      terminationEvidence = evidenceBooking?.terminationEvidence;
      if (!terminationEvidence || terminationEvidence.status !== "PENDING" || !this.matchesEvidence(terminationEvidence, input)) throw new BookingTerminationError("Termination evidence identity conflicts.", "BOOKING_TERMINATION_CONFLICT", 409);
      // Shadow decisions do not govern the existing provider mutation.
      try { await this.preserveDisposition(claimed, terminationEvidence); }
      catch { /* Missing shadow evidence requires later operational review. */ }
      action = recoveryOperation.kind;
      if (recoveryOperation.status === "PENDING") {
        const dispatched = await terminationOperations.markDispatched(recoveryOperation._id as mongoose.Types.ObjectId);
        if (!dispatched) throw new BookingTerminationError("Provider operation is already in progress.", "BOOKING_TERMINATION_CONFLICT", 409);
        recoveryOperation = dispatched;
      } else if (recoveryOperation.status === "UNKNOWN" && recoveryOperation.kind === "CANCEL") {
        const evidence = await this.verifiedEvidence(payment, "CANCEL");
        if (evidence.providerStatus !== "CANCELLED") throw new BookingTerminationError("Provider operation requires reconciliation.", "BOOKING_TERMINATION_CONFLICT", 409);
        const confirmed = await terminationOperations.recordVerifiedOutcome({ id: recoveryOperation._id as mongoose.Types.ObjectId, expected: "UNKNOWN", result: "CONFIRMED", providerStatus: evidence.providerStatus });
        if (!confirmed) throw new BookingTerminationError("Provider reconciliation conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        recoveryOperation = confirmed;
      } else if (recoveryOperation.status !== "CONFIRMED") {
        throw new BookingTerminationError("Provider operation requires reconciliation.", "BOOKING_TERMINATION_CONFLICT", 409);
      }
    }

    if (existingClaim?.status === "ACTIVE" && !recoveryOperation) throw new BookingTerminationError("Termination claim requires recovery before termination can continue.", "BOOKING_TERMINATION_CONFLICT", 409);
    if (payment?.providerPaymentId && (action === "CANCEL" || action === "REFUND") && !recoveryOperation) throw new BookingTerminationError("Provider mutation requires a termination operation.", "BOOKING_TERMINATION_CONFLICT", 409);

    try {
    if (payment && action === "CANCEL" && payment.providerPaymentId && recoveryOperation?.status !== "CONFIRMED") {
      const provider = paymentProviderRegistry.get(payment.provider);
      const result = await provider.cancelPayment({ providerPaymentId: payment.providerPaymentId });
      if (result.providerStatus !== "CANCELLED" || result.providerPaymentId !== payment.providerPaymentId) throw new PaymentError("Provider cancellation did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      const evidence = await this.verifiedEvidence(payment, "CANCEL");
      if (evidence.providerStatus !== "CANCELLED") throw new PaymentError("Provider cancellation evidence is inconsistent.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      providerStatus = result.providerStatus;
      if (recoveryOperation) {
        if (result.providerPaymentId !== payment.providerPaymentId) throw new PaymentError("Provider cancellation reference mismatch.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        const confirmed = await terminationOperations.recordVerifiedOutcome({ id: recoveryOperation._id as mongoose.Types.ObjectId, expected: "IN_FLIGHT", result: "CONFIRMED", providerStatus });
        if (!confirmed) throw new BookingTerminationError("Provider confirmation conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        recoveryOperation = confirmed;
      }
    }

    if (payment && action === "REFUND" && recoveryOperation?.status !== "CONFIRMED") {
      if (!payment.providerPaymentId) throw new PaymentError("Captured Payment is missing a provider payment identifier.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
      const refundKey = `${operationKey}:full-refund`;
      let refund = await refundService.findByIdempotencyKey(refundKey);
      if (!refund) refund = await refundService.createRefund({ paymentId: payment._id.toString(), bookingId: booking._id.toString(), userId: payment.userId.toString(), creatorId: payment.creatorId.toString(), amount: { amount: payment.amount, currency: payment.currency }, reason: undefined, provider: payment.provider, providerPaymentId: payment.providerPaymentId, idempotencyKey: refundKey });
      const auditActor = input.actorType === BookingTerminationActorType.CUSTOMER && input.actorId && mongoose.Types.ObjectId.isValid(input.actorId)
        ? { type: "USER" as const, id: new mongoose.Types.ObjectId(input.actorId) }
        : input.actorType === BookingTerminationActorType.CREATOR && input.actorId && mongoose.Types.ObjectId.isValid(input.actorId)
          ? { type: "CREATOR" as const, id: new mongoose.Types.ObjectId(input.actorId) }
          : { type: "SYSTEM" as const, reference: "booking-termination" };
      await createFinancialAudit({ action: AuditAction.REFUND_REQUESTED, actor: auditActor, entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider }, transition: { outcome: "PROCESSING" } });
      const provider = paymentProviderRegistry.get(payment.provider);
      const result = await provider.createRefund({ refundId: refund._id.toString(), bookingId: booking._id.toString(), refundReference: refund.refundReference, paymentReference: payment.paymentReference, providerPaymentId: payment.providerPaymentId, amount: { amount: payment.amount, currency: payment.currency }, idempotencyKey: refundKey });
      if (result.providerStatus !== "REFUNDED") throw new PaymentError("Provider refund did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      const evidence = await this.verifiedEvidence(payment, "REFUND", String(refund._id), result.providerRefundId);
      if (evidence.providerStatus !== "REFUNDED") throw new PaymentError("Provider refund evidence is inconsistent.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      await refundService.updateProviderReferences(refund._id.toString(), { providerRefundId: result.providerRefundId, providerPaymentId: payment.providerPaymentId });
      if (result.payload) await refundService.updateProviderPayload(refund._id.toString(), result.payload);
      await refundService.markCompleted(refund._id.toString(), result.providerRefundId);
      await createFinancialAudit({ action: AuditAction.REFUND_COMPLETED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider, providerReference: result.providerRefundId }, transition: { outcome: "SUCCEEDED" } });
      providerStatus = "REFUNDED";
      if (recoveryOperation) {
        const confirmed = await terminationOperations.recordVerifiedOutcome({ id: recoveryOperation._id as mongoose.Types.ObjectId, expected: "IN_FLIGHT", result: "CONFIRMED", providerStatus, providerOperationReference: result.providerRefundId });
        if (!confirmed) throw new BookingTerminationError("Provider confirmation conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        recoveryOperation = confirmed;
      }
    }
    } catch (error) {
      if (recoveryOperation?.status === "IN_FLIGHT") {
        await terminationOperations.markUnknown(recoveryOperation._id as mongoose.Types.ObjectId);
        throw new BookingTerminationError("Provider operation requires reconciliation.", "BOOKING_TERMINATION_CONFLICT", 409);
      }
      throw error;
    }

    if (recoveryOperation?.status === "CONFIRMED" && payment) {
      if (recoveryOperation.kind === "REFUND") {
        const refund = await refundService.findByIdempotencyKey(recoveryOperation.idempotencyKey);
        if (!refund || !recoveryOperation.providerOperationReference || recoveryOperation.providerStatus !== "REFUNDED") {
          throw new PaymentError("Confirmed provider refund evidence is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        const evidence = await this.verifiedEvidence(payment, "REFUND", String(refund._id), recoveryOperation.providerOperationReference);
        if (evidence.providerStatus !== "REFUNDED") throw new PaymentError("Confirmed provider refund evidence is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        providerStatus = "REFUNDED";
      } else {
        const evidence = await this.verifiedEvidence(payment, "CANCEL");
        if (recoveryOperation.providerStatus !== "CANCELLED" || evidence.providerStatus !== "CANCELLED") {
          throw new PaymentError("Confirmed provider cancellation evidence is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        providerStatus = "CANCELLED";
      }
    }

    const session = await mongoose.startSession();
    let finalBooking = null;
    let finalPayment = payment;
    let walletReleaseResult: SafeBookingWalletReleaseResult | null = null;
    let transactionError: unknown;
    let notificationResults: Awaited<ReturnType<typeof createBookingNotifications>> = [];
    try {
      await session.withTransaction(async () => {
        const dispositionBooking = recoveryOperation ? booking : await bookingRepository.findById(booking._id as mongoose.Types.ObjectId, session);
        if (!dispositionBooking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
        if (payment && action !== "RELEASE") {
          const currentPayment = await paymentRepository.findById(payment._id, session);
          if (!currentPayment) throw new PaymentError("Payment not found.", "PAYMENT_NOT_FOUND");
          const target = action === "REFUND" || providerStatus === "REFUNDED" ? PaymentStatus.REFUNDED : action === "CANCEL" || providerStatus === "CANCELLED" ? PaymentStatus.CANCELLED : currentPayment.status;
          if (target !== currentPayment.status) {
            if (target === PaymentStatus.REFUNDED) {
              await escrowRecognitionService.recognizeFullRefund(currentPayment, session);
            }
            const transitioned = await paymentRepository.transition(currentPayment._id, [currentPayment.status], { status: target, failureReason: target === PaymentStatus.CANCELLED ? PaymentFailureReason.PAYMENT_CANCELLED : currentPayment.failureReason }, session);
            if (!transitioned) throw new PaymentError("Payment termination transition conflicted.", "PAYMENT_LIFECYCLE_CONFLICT");
            finalPayment = transitioned;
          } else finalPayment = currentPayment;
        }
        const actorId = input.actorId && mongoose.Types.ObjectId.isValid(input.actorId) ? new mongoose.Types.ObjectId(input.actorId) : undefined;
        finalBooking = await bookingRepository.transitionToTerminated({ bookingId: booking._id, expectedStatuses: ["REQUESTED", "CONFIRMED"], targetStatus, terminationType: input.terminationType, terminationActorType: input.actorType, terminationActorId: actorId, terminationReason: input.reason?.trim(), terminationOperationKey: operationKey, terminationClaimVersion: recoveryOperation ? recoveryClaim?.version : undefined }, session);
        if (!finalBooking) throw new BookingTerminationError("Booking termination transition conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        const event = targetStatus === "REJECTED" ? "REJECTED" : targetStatus === "EXPIRED" ? "EXPIRED" : "CANCELLED";
        const recipients = targetStatus === "EXPIRED" ? [{ id: String(finalBooking.userId), actor: "user" as const }, { id: String(finalBooking.creatorId), actor: "creator" as const }] : input.actorType === BookingTerminationActorType.CUSTOMER ? [{ id: String(finalBooking.creatorId), actor: "creator" as const }] : [{ id: String(finalBooking.userId), actor: "user" as const }];
        notificationResults = await createBookingNotifications(finalBooking, event, recipients, session);
        const slotRelease = await Slot.updateMany(
          { _id: { $in: finalBooking.slotIds }, status: { $in: ["LOCKED", "BOOKED"] } },
          { $set: { status: "AVAILABLE" } },
          { session },
        );
        if (action === "RELEASE" && slotRelease.modifiedCount !== finalBooking.slotIds.length) {
          throw new BookingTerminationError(
            "Wallet booking slots could not be released atomically.",
            "BOOKING_TERMINATION_CONFLICT",
            409,
          );
        }
        if (action === "RELEASE" && walletReleaseCause) {
          const actorId = input.actorId && mongoose.Types.ObjectId.isValid(input.actorId)
            ? new mongoose.Types.ObjectId(input.actorId)
            : undefined;
          walletReleaseResult = await bookingWalletReservationReleaseService.release({
            bookingId: booking._id as mongoose.Types.ObjectId,
            cause: walletReleaseCause,
            actorType: input.actorType,
            actorId,
            reason: input.reason,
            session,
          });
        }
        if (recoveryOperation && recoveryClaim) {
          const finalizedClaim = await bookingRepository.transitionTerminationClaim({ bookingId: booking._id as mongoose.Types.ObjectId, operationKey, intent: input.terminationType, actorType: input.actorType, actorId, version: recoveryClaim.version, target: "FINALIZED", session });
          if (!finalizedClaim || !await terminationOperations.finalize(recoveryOperation._id as mongoose.Types.ObjectId, session)) throw new BookingTerminationError("Provider operation finalization conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        }
        if (terminationEvidence) {
          if (!await bookingRepository.finalizeTerminationEvidence(booking._id as mongoose.Types.ObjectId, terminationEvidence, session)) throw new BookingTerminationError("Termination evidence finalization conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
        } else {
          const localEvidence = await this.makeEvidence(input, receivedAt, session);
          if (!await bookingRepository.writeFinalTerminationEvidence(booking._id as mongoose.Types.ObjectId, localEvidence, session)) throw new BookingTerminationError("Termination evidence finalization conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
          // The shadow calculation must not decide whether wallet funds move.
          try { await this.preserveDisposition(dispositionBooking, localEvidence, session); }
          catch { /* Missing shadow evidence requires later operational review. */ }
        }
      });
    } catch (error) {
      transactionError = error;
    } finally { await session.endSession(); }

    if (transactionError) {
      if (action === "RELEASE" && walletReleaseCause) {
        const winner = await Booking.findById(booking._id);
        if (
          winner &&
          winner.terminationOperationKey === operationKey &&
          winner.terminationType === input.terminationType &&
          winner.terminatedByType === input.actorType &&
          String(winner.terminatedById ?? "") === String(input.actorId ?? "") &&
          winner.status === targetStatus
        ) {
          const savedEvidence = (await bookingRepository.findTerminationEvidence(winner._id as mongoose.Types.ObjectId))?.terminationEvidence;
          if (savedEvidence && (savedEvidence.status !== "FINALIZED" || !this.matchesEvidence(savedEvidence, input))) throw new BookingTerminationError("Termination evidence identity conflicts.", "BOOKING_TERMINATION_CONFLICT", 409);
          const replay = await bookingWalletReservationReleaseService.validateReplay({
            bookingId: winner._id as mongoose.Types.ObjectId,
            cause: walletReleaseCause,
          });
          return { ...replay, financialAction: "RELEASE" as FinancialAction, replay: true };
        }
      }
      throw transactionError;
    }
    if (action === "RELEASE") {
      const committedRelease =
        walletReleaseResult as SafeBookingWalletReleaseResult | null;
      if (!committedRelease) {
        throw new BookingTerminationError(
          "Wallet booking release did not complete.",
          "BOOKING_TERMINATION_CONFLICT",
          409,
        );
      }
      deliverCreatedBookingNotifications(notificationResults);
      return { ...committedRelease, financialAction: "RELEASE" as FinancialAction };
    }
    deliverCreatedBookingNotifications(notificationResults);
    return { booking: finalBooking, payment: finalPayment, financialAction: action, replay: false };
  }
}

export const bookingFinancialTerminationService = new BookingFinancialTerminationService();
