import { ClientSession, Types } from "mongoose";

import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../../enums/financial/bookingWalletCaptureCause.enum";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import {
  BookingWalletCaptureErrorCode,
  BookingWalletReservationCaptureError,
} from "../../errors/financial/BookingWalletReservationCaptureError";
import { WalletError } from "../../errors/financial/WalletError";
import { IBooking } from "../../models/booking.model";
import { BookingFundReservationDocument } from "../../models/bookingFundReservation.model";
import { Dispute } from "../../models/dispute.model";
import { IPayment } from "../../models/payment.model";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { bookingRepository } from "../../repositories/booking.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { deriveBookingWalletCaptureIdentity } from "../../utils/financial/bookingWalletCaptureIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import { walletProjectionService } from "../wallet/walletProjection.service";
import { ledgerService } from "./ledger.service";

export interface BookingWalletCaptureInput {
  bookingId: Types.ObjectId;
  cause: BookingWalletCaptureCause;
  actorType: BookingCompletionActorType;
  actorId?: Types.ObjectId;
  session: ClientSession;
}

export interface SafeBookingWalletCaptureResult {
  booking: {
    bookingReference?: string;
    status: "COMPLETED";
    completedAt: Date;
  };
  payment: {
    paymentReference: string;
    method: PaymentMethod.WALLET;
    status: PaymentStatus.CAPTURED;
    captureReference: string;
  };
  reservation: {
    reservationReference: string;
    status: BookingFundReservationStatus.CAPTURED;
    captureReference: string;
    captureCause: BookingWalletCaptureCause;
    amount: number;
    currency: string;
    capturedAt: Date;
  };
  wallet: {
    currency: string;
    availableBalance: number;
    reservedBalance: number;
    lockedBalance: number;
    currentBalance: number;
  };
  replay: boolean;
}

interface CaptureGraph {
  booking: IBooking;
  payment: IPayment;
  reservation: BookingFundReservationDocument;
}

const isTransientTransactionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
    errorLabels?: string[];
  };
  return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
    candidate.errorLabels?.includes("TransientTransactionError") === true;
};

export class BookingWalletReservationCaptureService {
  private fail(
    message: string,
    code: BookingWalletCaptureErrorCode,
    cause?: unknown,
  ): never {
    throw new BookingWalletReservationCaptureError(message, code, { cause });
  }

  private validateCause(graph: CaptureGraph, cause: BookingWalletCaptureCause): void {
    const { booking } = graph;
    if (booking.status !== "COMPLETED" || !booking.completedAt) {
      this.fail(
        "Only a legitimately completed Booking may capture Wallet funds.",
        "BOOKING_WALLET_CAPTURE_INVALID_BOOKING_STATUS",
      );
    }
    if (booking.completionCause !== cause) {
      this.fail(
        "Persisted completion cause conflicts with Wallet capture.",
        "BOOKING_WALLET_CAPTURE_CAUSE_CONFLICT",
      );
    }
    if (
      (cause === BookingWalletCaptureCause.CREATOR_COMPLETED &&
        booking.completedByType !== BookingCompletionActorType.CREATOR) ||
      (cause === BookingWalletCaptureCause.AUTO_COMPLETED &&
        booking.completedByType !== BookingCompletionActorType.SYSTEM)
    ) {
      this.fail(
        "Persisted completion actor conflicts with Wallet capture.",
        "BOOKING_WALLET_CAPTURE_CAUSE_CONFLICT",
      );
    }
    if (
      booking.paymentStatus !== "PAID" ||
      booking.isPayable ||
      booking.isPayoutEligible ||
      booking.isFinancialLocked ||
      booking.creatorEarningSnapshot !== undefined ||
      booking.platformCommissionSnapshot !== undefined
    ) {
      this.fail(
        "Completed Booking financial fields are inconsistent.",
        booking.isFinancialLocked
          ? "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED"
          : "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
      );
    }
  }

  private validateIdentity(graph: CaptureGraph): void {
    const { booking, payment, reservation } = graph;
    if (
      booking.paymentMethod !== PaymentMethod.WALLET ||
      payment.method !== PaymentMethod.WALLET
    ) {
      this.fail(
        "Booking Payment method is not Wallet.",
        "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT",
      );
    }
    if (
      reservation.bookingId.toString() !== booking._id.toString() ||
      reservation.paymentId.toString() !== payment._id.toString() ||
      payment.bookingId.toString() !== booking._id.toString() ||
      reservation.paymentReference !== payment.paymentReference ||
      booking.paymentReference !== payment.paymentReference ||
      booking.reservationReference !== reservation.reservationReference
    ) {
      this.fail(
        "Booking, Payment, and reservation links are inconsistent.",
        "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      );
    }
    if (
      reservation.userId.toString() !== booking.userId.toString() ||
      payment.userId.toString() !== booking.userId.toString() ||
      reservation.creatorId.toString() !== booking.creatorId.toString() ||
      payment.creatorId.toString() !== booking.creatorId.toString() ||
      reservation.serviceId.toString() !== booking.serviceId.toString()
    ) {
      this.fail(
        "Capture participant identity is inconsistent.",
        "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      );
    }
    if (
      !payment.walletId ||
      !payment.reservationId ||
      payment.walletId.toString() !== reservation.walletId.toString() ||
      payment.reservationId.toString() !== reservation._id.toString()
    ) {
      this.fail(
        "Payment Wallet reservation identity is inconsistent.",
        "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      );
    }
    if (
      reservation.amount !== booking.totalAmount ||
      payment.amount !== reservation.amount ||
      payment.authorizedAmount !== reservation.amount
    ) {
      this.fail(
        "Capture amount conflicts with authorization.",
        "BOOKING_WALLET_CAPTURE_AMOUNT_CONFLICT",
      );
    }
    if (
      reservation.currency !== booking.currency ||
      payment.currency !== reservation.currency
    ) {
      this.fail(
        "Capture currency conflicts with authorization.",
        "BOOKING_WALLET_CAPTURE_CURRENCY_CONFLICT",
      );
    }
    if (!reservation.ledgerTransactionId || !reservation.reservationKey) {
      this.fail(
        "Reservation authorization identity is incomplete.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    if (booking.settlementId || payment.settlementId) {
      this.fail(
        "Booking has already entered settlement.",
        "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT",
      );
    }
  }

  private async loadGraph(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<CaptureGraph> {
    const booking = await bookingRepository.findById(bookingId, session);
    if (!booking) {
      this.fail("Booking not found.", "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND");
    }
    if (!booking.paymentId) {
      this.fail("Booking Payment link is missing.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
    }
    const [payment, reservation] = await Promise.all([
      paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
      bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(
        booking._id as Types.ObjectId,
        session,
      ),
    ]);
    if (!payment) {
      this.fail("Payment not found.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
    }
    if (!reservation) {
      this.fail(
        "Wallet booking reservation was not found.",
        "BOOKING_WALLET_CAPTURE_RESERVATION_NOT_FOUND",
      );
    }
    return { booking, payment, reservation };
  }

  private identity(graph: CaptureGraph, cause: BookingWalletCaptureCause) {
    const { booking, payment, reservation } = graph;
    if (!booking.bookingReference || !reservation.ledgerTransactionId) {
      this.fail(
        "Wallet capture identity is incomplete.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    return deriveBookingWalletCaptureIdentity({
      reservationKey: reservation.reservationKey,
      reservationReference: reservation.reservationReference,
      authorizationTransactionId: reservation.ledgerTransactionId,
      bookingId: booking._id as Types.ObjectId,
      bookingReference: booking.bookingReference,
      paymentId: payment._id as Types.ObjectId,
      paymentReference: payment.paymentReference,
      userId: reservation.userId,
      walletId: reservation.walletId,
      creatorId: reservation.creatorId,
      serviceId: reservation.serviceId,
      amount: reservation.amount,
      currency: reservation.currency,
      cause,
    });
  }

  private safe(
    graph: CaptureGraph,
    wallet: Awaited<ReturnType<typeof walletRepository.findById>>,
    replay: boolean,
  ): SafeBookingWalletCaptureResult {
    const { booking, payment, reservation } = graph;
    if (
      !wallet ||
      !booking.completedAt ||
      !reservation.captureReference ||
      !reservation.captureCause ||
      !reservation.capturedAt
    ) {
      this.fail(
        "Captured Wallet reservation is missing safe result data.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    return {
      booking: {
        bookingReference: booking.bookingReference,
        status: "COMPLETED",
        completedAt: booking.completedAt,
      },
      payment: {
        paymentReference: payment.paymentReference,
        method: PaymentMethod.WALLET,
        status: PaymentStatus.CAPTURED,
        captureReference: reservation.captureReference,
      },
      reservation: {
        reservationReference: reservation.reservationReference,
        status: BookingFundReservationStatus.CAPTURED,
        captureReference: reservation.captureReference,
        captureCause: reservation.captureCause,
        amount: reservation.amount,
        currency: reservation.currency,
        capturedAt: reservation.capturedAt,
      },
      wallet: {
        currency: wallet.currency,
        availableBalance: wallet.availableBalance,
        reservedBalance: wallet.reservedBalance,
        lockedBalance: wallet.lockedBalance,
        currentBalance: wallet.currentBalance,
      },
      replay,
    };
  }

  private async validateCapturedGraph(
    graph: CaptureGraph,
    cause: BookingWalletCaptureCause,
    session?: ClientSession,
  ): Promise<SafeBookingWalletCaptureResult> {
    const { booking, payment, reservation } = graph;
    this.validateCause(graph, cause);
    this.validateIdentity(graph);
    if (reservation.status !== BookingFundReservationStatus.CAPTURED) {
      this.fail(
        "Reservation is not captured.",
        "BOOKING_WALLET_CAPTURE_INVALID_RESERVATION_STATUS",
      );
    }
    const identity = this.identity(graph, cause);
    if (
      reservation.captureCause !== cause ||
      reservation.captureKey !== identity.captureKey ||
      reservation.captureReference !== identity.captureReference ||
      reservation.captureTransactionId !== identity.captureTransactionId ||
      reservation.captureFingerprint !== identity.captureFingerprint ||
      !reservation.capturedAt ||
      reservation.capturedAt.getTime() !== booking.completedAt!.getTime() ||
      reservation.capturedByType !== booking.completedByType ||
      (booking.completedByType === BookingCompletionActorType.CREATOR &&
        (!reservation.capturedById ||
          !booking.completedById ||
          reservation.capturedById.toString() !== booking.completedById.toString())) ||
      !reservation.captureProjectionOperationId ||
      !reservation.captureProjectionOperationReference ||
      reservation.captureLedgerEntryIds.length !== 2
    ) {
      this.fail(
        "Captured reservation identity or links are inconsistent.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    if (
      payment.status !== PaymentStatus.CAPTURED ||
      payment.captureReference !== identity.captureReference ||
      payment.captureCause !== cause ||
      payment.capturedAmount !== reservation.amount ||
      !payment.capturedAt ||
      payment.capturedAt.getTime() !== reservation.capturedAt.getTime() ||
      payment.escrowLedgerTransactionReference !== identity.captureTransactionId ||
      payment.escrowRecognizedAt?.getTime() !== reservation.capturedAt.getTime()
    ) {
      this.fail(
        "Captured Payment state is inconsistent.",
        "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
      );
    }

    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.captureTransactionId,
    }, session);
    if (entries.length !== 2) {
      this.fail(
        "Capture Ledger transaction is incomplete.",
        "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT",
      );
    }
    const expectedLedgerIds = new Set(reservation.captureLedgerEntryIds.map(String));
    const commonValid = entries.every((entry) =>
      expectedLedgerIds.has(entry._id.toString()) &&
      entry.bookingId?.toString() === booking._id.toString() &&
      entry.paymentId?.toString() === payment._id.toString() &&
      entry.userId?.toString() === reservation.userId.toString() &&
      entry.source === LedgerSource.BOOKING_WALLET_CAPTURE &&
      entry.type === LedgerEntryType.BOOKING_FUNDS_CAPTURED &&
      entry.amount === reservation.amount &&
      entry.currency === reservation.currency &&
      entry.metadata?.reservationReference === reservation.reservationReference &&
      entry.metadata?.captureCause === cause &&
      entry.metadata?.creatorId === reservation.creatorId.toString() &&
      entry.metadata?.serviceId === reservation.serviceId.toString());
    const reservedDebit = entries.find((entry) =>
      entry.account === LedgerAccount.WALLET_RESERVED &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.walletId?.toString() === reservation.walletId.toString() &&
      entry.postingKey === identity.reservedPostingKey);
    const clearingCredit = entries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_ESCROW &&
      entry.direction === MoneyDirection.CREDIT &&
      !entry.walletId &&
      entry.postingKey === identity.clearingPostingKey);
    if (!commonValid || !reservedDebit || !clearingCredit) {
      this.fail(
        "Capture Ledger does not prove reserved-to-clearing movement.",
        "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT",
      );
    }

    const projection = await walletProjectionOperationRepository.findByOperationKey(
      identity.projectionOperationKey,
      session,
    );
    const projectionLedgerIds = new Set(projection?.ledgerEntryIds.map(String) ?? []);
    if (
      !projection ||
      !projection.fingerprint ||
      projection._id.toString() !== reservation.captureProjectionOperationId.toString() ||
      projection.operationReference !== reservation.captureProjectionOperationReference ||
      projection.walletId.toString() !== reservation.walletId.toString() ||
      projection.userId.toString() !== reservation.userId.toString() ||
      projection.currency !== reservation.currency ||
      projection.deltas.availableBalance !== 0 ||
      projection.deltas.reservedBalance !== -reservation.amount ||
      projection.deltas.lockedBalance !== 0 ||
      projectionLedgerIds.size !== 2 ||
      !entries.every((entry) => projectionLedgerIds.has(entry._id.toString()))
    ) {
      this.fail(
        "Capture Wallet projection is inconsistent.",
        "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT",
      );
    }
    const wallet = await walletRepository.findById(reservation.walletId, session);
    if (
      !wallet ||
      wallet.userId.toString() !== reservation.userId.toString() ||
      wallet.currency !== reservation.currency ||
      wallet.availableBalance < 0 ||
      wallet.reservedBalance < 0 ||
      wallet.lockedBalance < 0 ||
      wallet.currentBalance !==
        wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance
    ) {
      this.fail(
        "Captured Wallet state is inconsistent.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    return this.safe(graph, wallet, true);
  }

  async validateReplay(input: {
    bookingId: Types.ObjectId;
    cause: BookingWalletCaptureCause;
    session?: ClientSession;
  }): Promise<SafeBookingWalletCaptureResult> {
    const graph = await this.loadGraph(input.bookingId, input.session);
    return this.validateCapturedGraph(graph, input.cause, input.session);
  }

  async capture(input: BookingWalletCaptureInput): Promise<SafeBookingWalletCaptureResult> {
    if (!input.session.inTransaction()) {
      this.fail(
        "Wallet capture requires an active transaction.",
        "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT",
      );
    }
    const graph = await this.loadGraph(input.bookingId, input.session);
    this.validateCause(graph, input.cause);
    this.validateIdentity(graph);
    const { booking, payment, reservation } = graph;

    if (booking.isFinancialLocked) {
      this.fail("Booking is financially locked.", "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED");
    }
    if (await Dispute.exists({ bookingId: booking._id, status: "OPEN" }).session(input.session)) {
      this.fail("An OPEN dispute blocks Wallet capture.", "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN");
    }
    if (reservation.status === BookingFundReservationStatus.RELEASED) {
      this.fail(
        "Released Wallet reservations cannot be captured.",
        "BOOKING_WALLET_CAPTURE_ALREADY_RELEASED",
      );
    }
    if (reservation.status === BookingFundReservationStatus.CAPTURED) {
      return this.validateCapturedGraph(graph, input.cause, input.session);
    }
    if (reservation.status !== BookingFundReservationStatus.ACTIVE) {
      this.fail(
        "Only ACTIVE Wallet reservations can be captured.",
        "BOOKING_WALLET_CAPTURE_INVALID_RESERVATION_STATUS",
      );
    }
    if (
      reservation.captureReference ||
      reservation.captureKey ||
      reservation.captureTransactionId ||
      reservation.captureLedgerEntryIds.length > 0 ||
      reservation.captureProjectionOperationId ||
      reservation.captureProjectionOperationReference ||
      reservation.captureCause ||
      reservation.capturedAt ||
      reservation.captureFingerprint
    ) {
      this.fail(
        "ACTIVE reservation contains partial capture authority.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    if (payment.status !== PaymentStatus.AUTHORIZED) {
      this.fail(
        "Wallet Payment is not authorized for capture.",
        "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
      );
    }

    const identity = this.identity(graph, input.cause);
    const [existingEntries, existingProjection, existingCapture] = await Promise.all([
      ledgerEntryRepository.findManyWithPostingKeys({
        transactionId: identity.captureTransactionId,
      }, input.session),
      walletProjectionOperationRepository.findByOperationKey(
        identity.projectionOperationKey,
        input.session,
      ),
      bookingFundReservationRepository.findByCaptureKey(
        identity.captureKey,
        input.session,
      ),
    ]);
    if (existingEntries.length || existingProjection || existingCapture) {
      this.fail(
        "A partial or conflicting Wallet capture graph already exists.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }

    let reservedDebit;
    let clearingCredit;
    try {
      const common = {
        type: LedgerEntryType.BOOKING_FUNDS_CAPTURED,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
        money: { amount: reservation.amount, currency: reservation.currency },
        transactionId: identity.captureTransactionId,
        bookingId: booking._id.toString(),
        paymentId: payment._id.toString(),
        userId: reservation.userId.toString(),
        idempotencyKey: identity.captureTransactionId,
        metadata: {
          reservationReference: reservation.reservationReference,
          captureReference: identity.captureReference,
          captureCause: input.cause,
          creatorId: reservation.creatorId.toString(),
          serviceId: reservation.serviceId.toString(),
        },
      } as const;
      reservedDebit = await ledgerService.createDebit({
        ...common,
        account: LedgerAccount.WALLET_RESERVED,
        walletId: reservation.walletId.toString(),
        postingKey: identity.reservedPostingKey,
        description: "Booking Wallet reserved funds captured",
      }, input.session);
      clearingCredit = await ledgerService.createCredit({
        ...common,
        account: LedgerAccount.PLATFORM_ESCROW,
        postingKey: identity.clearingPostingKey,
        description: "Captured booking funds held in platform escrow clearing",
      }, input.session);
    } catch (error) {
      if (isTransientTransactionError(error)) throw error;
      this.fail(
        "Ledger could not record Wallet capture.",
        "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT",
        error,
      );
    }

    let wallet;
    try {
      wallet = await walletProjectionService.applyProjectionMutation({
        userId: reservation.userId,
        currency: reservation.currency,
        operationKey: identity.projectionOperationKey,
        deltas: {
          availableBalance: 0,
          reservedBalance: -reservation.amount,
          lockedBalance: 0,
        },
        minimums: { reservedBalance: reservation.amount },
        ledgerEntryIds: [
          reservedDebit._id as Types.ObjectId,
          clearingCredit._id as Types.ObjectId,
        ],
      }, input.session);
    } catch (error) {
      if (isTransientTransactionError(error)) throw error;
      if (error instanceof WalletError && error.code === "WALLET_INSUFFICIENT_BALANCE") {
        this.fail(
          "Wallet reserved balance is below the reservation amount.",
          "BOOKING_WALLET_CAPTURE_INSUFFICIENT_RESERVED_BALANCE",
          error,
        );
      }
      this.fail(
        "Wallet projection could not apply capture.",
        "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT",
        error,
      );
    }

    const projection = await walletProjectionOperationRepository.findByOperationKey(
      identity.projectionOperationKey,
      input.session,
    );
    if (!projection) {
      this.fail(
        "Capture projection operation is missing.",
        "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      );
    }
    const capturedAt = booking.completedAt!;
    const captured = await bookingFundReservationRepository.guardActiveToCaptured({
      reservationId: reservation._id as Types.ObjectId,
      bookingId: booking._id as Types.ObjectId,
      paymentId: payment._id as Types.ObjectId,
      userId: reservation.userId,
      walletId: reservation.walletId,
      creatorId: reservation.creatorId,
      serviceId: reservation.serviceId,
      amount: reservation.amount,
      currency: reservation.currency,
      captureReference: identity.captureReference,
      captureKey: identity.captureKey,
      captureTransactionId: identity.captureTransactionId,
      captureLedgerEntryIds: [
        reservedDebit._id as Types.ObjectId,
        clearingCredit._id as Types.ObjectId,
      ],
      captureProjectionOperationId: projection._id as Types.ObjectId,
      captureProjectionOperationReference: projection.operationReference,
      captureCause: input.cause,
      capturedAt,
      capturedByType: input.actorType,
      capturedById: input.actorId,
      captureFingerprint: identity.captureFingerprint,
      expectedVersion: reservation.version,
    }, input.session);
    if (!captured) {
      this.fail(
        "Reservation capture transition conflicted.",
        "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT",
      );
    }

    const capturedPayment = await paymentRepository.guardWalletAuthorizedToCaptured({
      paymentId: payment._id as Types.ObjectId,
      bookingId: booking._id as Types.ObjectId,
      reservationId: reservation._id as Types.ObjectId,
      reservationReference: reservation.reservationReference,
      walletId: reservation.walletId,
      amount: reservation.amount,
      currency: reservation.currency,
      captureReference: identity.captureReference,
      captureCause: input.cause,
      captureTransactionId: identity.captureTransactionId,
      capturedAt,
    }, input.session);
    if (!capturedPayment) {
      this.fail(
        "Payment capture transition conflicted.",
        "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
      );
    }

    const auditActor = input.actorType === BookingCompletionActorType.CREATOR
      ? { type: "CREATOR" as const, id: input.actorId }
      : { type: "SYSTEM" as const, reference: "booking-auto-completion" };
    try {
      await createFinancialAudit({
        action: AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
        actor: auditActor,
        entityType: "BOOKING_FUND_RESERVATION",
        entityId: captured._id as Types.ObjectId,
        financialContext: {
          domain: "BOOKING_WALLET",
          primaryReference: identity.captureReference,
          bookingReference: booking.bookingReference,
          paymentReference: payment.paymentReference,
          amount: reservation.amount,
          currency: reservation.currency,
          ledgerTransactionReference: identity.captureTransactionId,
          projectionOperationReference: projection.operationReference,
        },
        transition: {
          fromStatus: BookingFundReservationStatus.ACTIVE,
          toStatus: BookingFundReservationStatus.CAPTURED,
          outcome: "SUCCEEDED",
        },
        metadata: { reasonCode: input.cause },
        session: input.session,
      });
    } catch (error) {
      if (isTransientTransactionError(error)) throw error;
      this.fail(
        "Capture audit could not be persisted.",
        "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT",
        error,
      );
    }

    return this.safe({
      booking,
      payment: capturedPayment,
      reservation: captured,
    }, wallet, false);
  }
}

export const bookingWalletReservationCaptureService =
  new BookingWalletReservationCaptureService();
