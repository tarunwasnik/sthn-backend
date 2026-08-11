import mongoose from "mongoose";

import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { BookingTerminationError } from "../../errors/booking/BookingTerminationError";
import { PaymentError } from "../../errors/financial/PaymentError";
import { bookingRepository } from "../../repositories/booking.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import ProviderPaymentService from "../internalProvider/payments/providerPayment.service";
import ProviderRefundService from "../internalProvider/refunds/providerRefund.service";
import ProviderEventService from "../internalProvider/events/providerEvent.service";
import { ProviderOperation, ProviderStatus } from "../../constants/internalProvider";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";
import { refundService } from "./refund.service";
import { Booking } from "../../models/booking.model";
import { IBooking } from "../../models/booking.model";
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

export interface TerminateBookingFinanciallyInput {
  bookingId: string;
  actorType: BookingTerminationActorType;
  actorId?: string;
  terminationType: BookingTerminationType;
  reason?: string;
}

type FinancialAction = "NONE" | "CANCEL" | "REFUND" | "RELEASE";

export class BookingFinancialTerminationService {
  private operationKey(bookingId: string): string { return `booking-termination:${bookingId}`; }

  private targetStatus(type: BookingTerminationType): "REJECTED" | "CANCELLED" | "EXPIRED" {
    if (type === BookingTerminationType.CREATOR_REJECTED) return "REJECTED";
    if (type === BookingTerminationType.BOOKING_EXPIRED) return "EXPIRED";
    return "CANCELLED";
  }

  private async authorize(input: TerminateBookingFinanciallyInput, booking: IBooking | null) {
    if (!booking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
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
    if (providerStatus === ProviderStatus.CAPTURED || paymentStatus === PaymentStatus.CAPTURED) return "REFUND";
    if (providerStatus === ProviderStatus.REFUNDED) return "NONE";
    if (providerStatus === ProviderStatus.CANCELLED) return "NONE";
    return "CANCEL";
  }

  async terminateBookingFinancially(input: TerminateBookingFinanciallyInput) {
    if (!mongoose.Types.ObjectId.isValid(input.bookingId)) throw new BookingTerminationError("Invalid booking id.", "BOOKING_NOT_FOUND", 400);
    const booking = await Booking.findById(input.bookingId);
    await this.authorize(input, booking);
    if (!booking) throw new BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
    const operationKey = this.operationKey(booking._id.toString());
    const targetStatus = this.targetStatus(input.terminationType);

    if (["CANCELLED", "REJECTED", "EXPIRED"].includes(booking.status)) {
      if (booking.terminationOperationKey === operationKey && booking.terminationType === input.terminationType) {
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
    if (booking.hasInteracted && ![BookingTerminationActorType.ADMIN, BookingTerminationActorType.GOVERNANCE, BookingTerminationActorType.SYSTEM].includes(input.actorType)) throw new BookingTerminationError("Booking cancellation is restricted after interaction.", "BOOKING_ONGOING_TERMINATION_RESTRICTED", 409);

    const payment = booking.paymentId ? await paymentRepository.findById(booking.paymentId) : null;
    if (payment && booking.paymentMethod !== payment.method) {
      throw new BookingWalletReservationReleaseError(
        "Booking and Payment method links are inconsistent.",
        "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT",
      );
    }
    let action: FinancialAction = "NONE";
    let providerStatus: string | undefined;
    let providerPayment: Awaited<ReturnType<typeof ProviderPaymentService.findByProviderPaymentId>> = null;
    if (payment?.providerPaymentId) {
      providerPayment = await ProviderPaymentService.findByProviderPaymentId(payment.providerPaymentId);
      if (!providerPayment || !providerPayment.paymentId.equals(payment._id)) throw new PaymentError("Provider payment does not belong to the Financial Payment.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
      if (providerPayment.amount !== payment.amount) throw new PaymentError("Provider payment amount does not match Financial Payment.", "PAYMENT_PROVIDER_AMOUNT_MISMATCH");
      if (providerPayment.currency !== payment.currency) throw new PaymentError("Provider payment currency does not match Financial Payment.", "PAYMENT_PROVIDER_CURRENCY_MISMATCH");
      providerStatus = providerPayment.status;
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
      action = this.actionFor(payment.status, providerStatus);
    }

    if (payment && action === "CANCEL" && payment.providerPaymentId) {
      const provider = paymentProviderRegistry.get(payment.provider);
      const result = await provider.cancelPayment({ providerPaymentId: payment.providerPaymentId });
      if (result.providerStatus !== ProviderStatus.CANCELLED) throw new PaymentError("Provider cancellation did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      const events = await ProviderEventService.getPaymentTimeline(payment.providerPaymentId);
      if (!events.some((event) => event.operation === ProviderOperation.CANCEL_PAYMENT)) throw new PaymentError("Provider cancellation event is missing.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      providerStatus = result.providerStatus;
    }

    if (payment && action === "REFUND") {
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
      await refundService.updateProviderReferences(refund._id.toString(), { providerRefundId: result.providerRefundId, providerPaymentId: payment.providerPaymentId });
      if (result.payload) await refundService.updateProviderPayload(refund._id.toString(), result.payload);
      if (result.providerStatus !== "REFUNDED") throw new PaymentError("Provider refund did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
      await refundService.markCompleted(refund._id.toString(), result.providerRefundId);
      await createFinancialAudit({ action: AuditAction.REFUND_COMPLETED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider, providerReference: result.providerRefundId }, transition: { outcome: "SUCCEEDED" } });
      const providerRefund = await ProviderRefundService.findByProviderRefundId(result.providerRefundId);
      if (!providerRefund || providerRefund.refundId.toString() !== refund._id.toString() || providerRefund.amount !== payment.amount || providerRefund.currency !== payment.currency) throw new PaymentError("Provider refund identity is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
      providerStatus = ProviderStatus.REFUNDED;
    }

    const session = await mongoose.startSession();
    let finalBooking = null;
    let finalPayment = payment;
    let walletReleaseResult: SafeBookingWalletReleaseResult | null = null;
    let transactionError: unknown;
    try {
      await session.withTransaction(async () => {
        if (payment && action !== "RELEASE") {
          const currentPayment = await paymentRepository.findById(payment._id, session);
          if (!currentPayment) throw new PaymentError("Payment not found.", "PAYMENT_NOT_FOUND");
          const target = action === "REFUND" || providerStatus === ProviderStatus.REFUNDED ? PaymentStatus.REFUNDED : action === "CANCEL" || providerStatus === ProviderStatus.CANCELLED ? PaymentStatus.CANCELLED : currentPayment.status;
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
        finalBooking = await bookingRepository.transitionToTerminated({ bookingId: booking._id, expectedStatuses: ["REQUESTED", "CONFIRMED"], targetStatus, terminationType: input.terminationType, terminationActorType: input.actorType, terminationActorId: actorId, terminationReason: input.reason?.trim(), terminationOperationKey: operationKey }, session);
        if (!finalBooking) throw new BookingTerminationError("Booking termination transition conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
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
          winner.status === targetStatus
        ) {
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
      return { ...committedRelease, financialAction: "RELEASE" as FinancialAction };
    }
    return { booking: finalBooking, payment: finalPayment, financialAction: action, replay: false };
  }
}

export const bookingFinancialTerminationService = new BookingFinancialTerminationService();
