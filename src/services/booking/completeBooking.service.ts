import mongoose, { Types } from "mongoose";

import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../../enums/financial/bookingWalletCaptureCause.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { BookingWalletReservationCaptureError } from "../../errors/financial/BookingWalletReservationCaptureError";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { Slot } from "../../models/slot.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { FeatureFlagGuard } from "../controlPlane/featureFlagGuard.service";
import { bookingWalletReservationCaptureService } from "../financial/bookingWalletReservationCapture.service";
import { finalizePendingSuspension } from "../accountGovernance/suspensionFinalizer.service";
import { createBookingCompletionTiming } from "./bookingCompletionTiming.service";
import { createBookingNotifications, deliverCreatedBookingNotifications } from "../notification/bookingNotification.service";
import {
  AuthorizedAllocationDecision,
  CreatorEntitlementService,
} from "../financial/creatorEntitlement.service";
import { marketplacePricingService } from "../financial/marketplacePricing.service";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../../constants/financial/supportedCurrencies";

interface CompleteBookingInput {
  bookingId: string;
  creatorId: string;
  role: string;
}

interface CompletionInput {
  bookingId: string;
  cause: BookingWalletCaptureCause;
  actorType: BookingCompletionActorType;
  actorId?: string;
}

const operationKey = (bookingId: string) => `booking-completion:${bookingId}`;
const CREATOR_ENTITLEMENT_COMPLETION_AUTHORITY = "BOOKING_COMPLETION_V1";

const completionEntitlementService = new CreatorEntitlementService({
  async readAuthorized(authority, decisionId, session): Promise<AuthorizedAllocationDecision | null> {
    if (authority !== CREATOR_ENTITLEMENT_COMPLETION_AUTHORITY) return null;
    const bookingId = decisionId.startsWith("booking-completion:")
      ? decisionId.slice("booking-completion:".length)
      : "";
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return null;

    const booking = await bookingRepository.findById(new Types.ObjectId(bookingId), session);
    if (
      !booking ||
      booking.status !== "COMPLETED" ||
      !booking.completedAt ||
      booking.completionOperationKey !== decisionId ||
      !booking.paymentId ||
      booking.paymentMethod === PaymentMethod.WALLET ||
      !SUPPORTED_CURRENCIES.includes(booking.currency as SupportedCurrency)
    ) return null;

    marketplacePricingService.validate({
      serviceAmount: booking.serviceAmount,
      platformFeeAmount: booking.platformFeeAmount,
      commissionAmount: booking.commissionAmount,
      creatorAmount: booking.creatorAmount,
      totalAmount: booking.totalAmount,
      currency: booking.currency as SupportedCurrency,
    });
    const platformAmount = booking.platformFeeAmount + booking.commissionAmount;
    if (!Number.isSafeInteger(platformAmount) || booking.creatorAmount + platformAmount !== booking.totalAmount) {
      return null;
    }
    return {
      authority,
      decisionId,
      bookingId: booking._id,
      paymentId: booking.paymentId,
      creatorId: booking.creatorId,
      currency: booking.currency as SupportedCurrency,
      totalAmount: booking.totalAmount,
      creatorAmount: booking.creatorAmount,
      platformAmount,
      customerRefundAmount: 0,
    };
  },
});

const recognizeProviderCompletionEntitlement = async (
  bookingId: Types.ObjectId,
  session?: mongoose.ClientSession,
) => completionEntitlementService.recognize({
  authority: CREATOR_ENTITLEMENT_COMPLETION_AUTHORITY,
  decisionId: operationKey(String(bookingId)),
}, session);

const assertAutoTiming = async (
  slotIds: Types.ObjectId[],
  session: mongoose.ClientSession,
) => {
  const slots = await Slot.find(
    { _id: { $in: slotIds } },
    { _id: 1, endTime: 1 },
    { session },
  );
  if (slots.length !== slotIds.length) {
    throw new BookingWalletReservationCaptureError(
      "Completion slot identity is incomplete.",
      "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
    );
  }
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1_000;
  if (slots.some((slot) => slot.endTime.getTime() + tenMinutes > now)) {
    throw new BookingWalletReservationCaptureError(
      "Booking is not yet eligible for automatic completion.",
      "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
    );
  }
};

const completeBookingApplication = async (input: CompletionInput) => {
  if (!mongoose.Types.ObjectId.isValid(input.bookingId)) {
    throw new BookingWalletReservationCaptureError(
      "Booking not found.",
      "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND",
    );
  }
  const bookingId = new Types.ObjectId(input.bookingId);
  const completionKey = operationKey(input.bookingId);
  const initial = await Booking.findById(bookingId);
  if (!initial) {
    throw new BookingWalletReservationCaptureError(
      "Booking not found.",
      "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND",
    );
  }
  if (
    input.actorType === BookingCompletionActorType.CREATOR &&
    initial.creatorId.toString() !== input.actorId
  ) {
    throw new BookingWalletReservationCaptureError(
      "Creator is not authorized to complete this Booking.",
      "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
    );
  }

  if (initial.status === "COMPLETED") {
    if (
      initial.completionOperationKey !== completionKey ||
      initial.completionCause !== input.cause
    ) {
      throw new BookingWalletReservationCaptureError(
        "Booking already has a conflicting completion.",
        "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
      );
    }
    if (initial.paymentMethod === PaymentMethod.WALLET) {
      return bookingWalletReservationCaptureService.validateReplay({
        bookingId,
        cause: input.cause,
      });
    }
    const payment = initial.paymentId
      ? await paymentRepository.findById(initial.paymentId)
      : null;
    const entitlement = await recognizeProviderCompletionEntitlement(initial._id);
    return { booking: initial, payment, entitlement, replay: true };
  }

  const actorId = input.actorId && mongoose.Types.ObjectId.isValid(input.actorId)
    ? new Types.ObjectId(input.actorId)
    : undefined;
  const session = await mongoose.startSession();
  let result: unknown;
  let affectedUserId: string | null = null;
  let affectedCreatorId: string | null = null;
  let notificationResults: Awaited<ReturnType<typeof createBookingNotifications>> = [];
  try {
    await session.withTransaction(async () => {
      const booking = await bookingRepository.findById(bookingId, session);
      if (!booking) {
        throw new BookingWalletReservationCaptureError(
          "Booking not found.",
          "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND",
        );
      }
      if (booking.status !== "CONFIRMED") {
        throw new BookingWalletReservationCaptureError(
          "Only a confirmed Booking can be completed.",
          "BOOKING_WALLET_CAPTURE_INVALID_BOOKING_STATUS",
        );
      }
      if (
        input.actorType === BookingCompletionActorType.CREATOR &&
        booking.creatorId.toString() !== input.actorId
      ) {
        throw new BookingWalletReservationCaptureError(
          "Creator is not authorized to complete this Booking.",
          "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
        );
      }
      if (booking.isFinancialLocked) {
        throw new BookingWalletReservationCaptureError(
          "Financial operations are locked for this Booking.",
          "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED",
        );
      }
      if (await Dispute.exists({ bookingId, status: "OPEN" }).session(session)) {
        throw new BookingWalletReservationCaptureError(
          "An OPEN dispute blocks Booking completion.",
          "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN",
        );
      }
      if (!booking.isPayable || booking.paymentStatus === "REFUNDED") {
        throw new BookingWalletReservationCaptureError(
          "Booking is not payable.",
          "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
        );
      }
      if (booking.isPayoutEligible || booking.settlementId) {
        throw new BookingWalletReservationCaptureError(
          "Booking has entered a later financial lifecycle.",
          "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
        );
      }
      if (
        booking.creatorEarningSnapshot !== undefined ||
        booking.platformCommissionSnapshot !== undefined
      ) {
        throw new BookingWalletReservationCaptureError(
          "Booking already contains allocation snapshots.",
          "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
        );
      }
      if (!booking.paymentId) {
        throw new BookingWalletReservationCaptureError(
          "Booking Payment was not found.",
          "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND",
        );
      }
      const payment = await paymentRepository.findByIdWithWalletLinks(
        booking.paymentId,
        session,
      );
      if (!payment) {
        throw new BookingWalletReservationCaptureError(
          "Booking Payment was not found.",
          "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND",
        );
      }
      if (booking.paymentMethod !== payment.method) {
        throw new BookingWalletReservationCaptureError(
          "Booking and Payment methods conflict.",
          "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT",
        );
      }
      if (input.cause === BookingWalletCaptureCause.AUTO_COMPLETED) {
        await assertAutoTiming(booking.slotIds, session);
      }
      if (
        payment.method === PaymentMethod.INTERNAL &&
        payment.status !== PaymentStatus.CAPTURED
      ) {
        throw new BookingWalletReservationCaptureError(
          "Internal-provider Payment is not captured.",
          "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
        );
      }

      const timing = createBookingCompletionTiming();
      const completed = await bookingRepository.guardConfirmedToCompleted({
        bookingId,
        cause: input.cause,
        actorType: input.actorType,
        actorId,
        operationKey: completionKey,
        completedAt: timing.completedAt,
        settlementEligibleAt: timing.settlementEligibleAt,
      }, session);
      if (!completed) {
        throw new BookingWalletReservationCaptureError(
          "Booking completion transition conflicted.",
          "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT",
        );
      }
      affectedUserId = completed.userId.toString();
      affectedCreatorId = completed.creatorId.toString();
      notificationResults = await createBookingNotifications(completed, "COMPLETED", [{ id: String(completed.userId), actor: "user" }, { id: String(completed.creatorId), actor: "creator" }], session);

      if (payment.method === PaymentMethod.WALLET) {
        result = await bookingWalletReservationCaptureService.capture({
          bookingId,
          cause: input.cause,
          actorType: input.actorType,
          actorId,
          session,
        });
      } else {
        const entitlement = await recognizeProviderCompletionEntitlement(completed._id, session);
        result = { booking: completed, payment, entitlement, replay: false };
      }
    });
  } catch (error) {
    const winner = await bookingRepository.findCompletedReplay(
      bookingId,
      completionKey,
    );
    if (
      winner?.completionCause === input.cause &&
      winner.paymentMethod === PaymentMethod.WALLET
    ) {
      return bookingWalletReservationCaptureService.validateReplay({
        bookingId,
        cause: input.cause,
      });
    }
    if (winner?.completionCause === input.cause) {
      const payment = winner.paymentId
        ? await paymentRepository.findById(winner.paymentId)
        : null;
      const entitlement = await recognizeProviderCompletionEntitlement(winner._id);
      return { booking: winner, payment, entitlement, replay: true };
    }
    throw error;
  } finally {
    await session.endSession();
  }
  deliverCreatedBookingNotifications(notificationResults);

  if (input.actorType === BookingCompletionActorType.CREATOR) {
    if (affectedUserId) await finalizePendingSuspension({ userId: affectedUserId });
    if (affectedCreatorId && affectedCreatorId !== affectedUserId) {
      await finalizePendingSuspension({ userId: affectedCreatorId });
    }
  }
  return result;
};

export const completeBookingService = async ({
  bookingId,
  creatorId,
  role,
}: CompleteBookingInput) => {
  await FeatureFlagGuard.requireEnabled(
    "BOOKING_COMPLETION_ENABLED",
    { userId: creatorId, role },
    "Booking completion is temporarily disabled",
  );
  if (role !== "creator") {
    throw new BookingWalletReservationCaptureError(
      "Only the authenticated Creator may complete this Booking.",
      "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
    );
  }
  return completeBookingApplication({
    bookingId,
    cause: BookingWalletCaptureCause.CREATOR_COMPLETED,
    actorType: BookingCompletionActorType.CREATOR,
    actorId: creatorId,
  });
};

export const completeBookingAutomatically = (bookingId: string) =>
  completeBookingApplication({
    bookingId,
    cause: BookingWalletCaptureCause.AUTO_COMPLETED,
    actorType: BookingCompletionActorType.SYSTEM,
  });
