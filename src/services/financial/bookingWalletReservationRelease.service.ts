import mongoose, { ClientSession, Types } from "mongoose";

import {
  BookingTerminationActorType,
  BookingTerminationType,
} from "../../enums/booking/bookingTerminationType.enum";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletReleaseCause } from "../../enums/financial/bookingWalletReleaseCause.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import {
  BookingWalletReleaseErrorCode,
  BookingWalletReservationReleaseError,
} from "../../errors/financial/BookingWalletReservationReleaseError";
import { WalletError } from "../../errors/financial/WalletError";
import { IBooking } from "../../models/booking.model";
import { BookingFundReservationDocument } from "../../models/bookingFundReservation.model";
import { IPayment } from "../../models/payment.model";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { bookingRepository } from "../../repositories/booking.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { deriveBookingWalletReleaseIdentity } from "../../utils/financial/bookingWalletReleaseIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import { walletProjectionService } from "../wallet/walletProjection.service";
import { ledgerService } from "./ledger.service";

const TERMINATION_CAUSES = new Map<BookingTerminationType, BookingWalletReleaseCause>([
  [BookingTerminationType.CREATOR_REJECTED, BookingWalletReleaseCause.CREATOR_REJECTED],
  [BookingTerminationType.BOOKING_EXPIRED, BookingWalletReleaseCause.REQUEST_EXPIRED],
  [BookingTerminationType.CUSTOMER_CANCELLED, BookingWalletReleaseCause.USER_CANCELLED],
  [BookingTerminationType.CREATOR_CANCELLED, BookingWalletReleaseCause.CREATOR_CANCELLED],
  [BookingTerminationType.ADMIN_CANCELLED, BookingWalletReleaseCause.ADMIN_CANCELLED],
  [BookingTerminationType.GOVERNANCE_TERMINATED, BookingWalletReleaseCause.GOVERNANCE_TERMINATED],
]);

export const bookingWalletReleaseCauseForTermination = (
  terminationType: BookingTerminationType,
): BookingWalletReleaseCause | null => TERMINATION_CAUSES.get(terminationType) ?? null;

const expectedBookingStatus = (
  cause: BookingWalletReleaseCause,
): "REJECTED" | "EXPIRED" | "CANCELLED" => {
  if (cause === BookingWalletReleaseCause.CREATOR_REJECTED) return "REJECTED";
  if (cause === BookingWalletReleaseCause.REQUEST_EXPIRED) return "EXPIRED";
  return "CANCELLED";
};

const targetPaymentStatus = (
  cause: BookingWalletReleaseCause,
): PaymentStatus.CANCELLED | PaymentStatus.EXPIRED =>
  cause === BookingWalletReleaseCause.REQUEST_EXPIRED
    ? PaymentStatus.EXPIRED
    : PaymentStatus.CANCELLED;

const isTransientTransactionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
    errorLabels?: string[];
  };
  return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
    candidate.errorLabels?.includes("TransientTransactionError") === true;
};

export interface BookingWalletReleaseInput {
  bookingId: Types.ObjectId;
  cause: BookingWalletReleaseCause;
  actorType: BookingTerminationActorType;
  actorId?: Types.ObjectId;
  reason?: string;
  session: ClientSession;
}

export interface SafeBookingWalletReleaseResult {
  booking: { bookingReference?: string; status: string };
  payment: {
    paymentReference: string;
    method: PaymentMethod.WALLET;
    status: PaymentStatus;
    releaseReference: string;
  };
  reservation: {
    reservationReference: string;
    status: BookingFundReservationStatus.RELEASED;
    releaseReference: string;
    releaseCause: BookingWalletReleaseCause;
    amount: number;
    currency: string;
    releasedAt: Date;
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

interface ReleaseGraph {
  booking: IBooking;
  payment: IPayment;
  reservation: BookingFundReservationDocument;
}

export class BookingWalletReservationReleaseService {
  private fail(
    message: string,
    code: BookingWalletReleaseErrorCode,
    cause?: unknown,
  ): never {
    throw new BookingWalletReservationReleaseError(message, code, { cause });
  }

  private validateCause(booking: IBooking, cause: BookingWalletReleaseCause): void {
    if (booking.status !== expectedBookingStatus(cause)) {
      this.fail(
        "Booking status does not match the Wallet release cause.",
        "BOOKING_WALLET_RELEASE_INVALID_BOOKING_STATUS",
      );
    }
    const expectedTermination = new Map<BookingWalletReleaseCause, BookingTerminationType>([
      [BookingWalletReleaseCause.CREATOR_REJECTED, BookingTerminationType.CREATOR_REJECTED],
      [BookingWalletReleaseCause.REQUEST_EXPIRED, BookingTerminationType.BOOKING_EXPIRED],
      [BookingWalletReleaseCause.USER_CANCELLED, BookingTerminationType.CUSTOMER_CANCELLED],
      [BookingWalletReleaseCause.CREATOR_CANCELLED, BookingTerminationType.CREATOR_CANCELLED],
      [BookingWalletReleaseCause.ADMIN_CANCELLED, BookingTerminationType.ADMIN_CANCELLED],
      [BookingWalletReleaseCause.GOVERNANCE_TERMINATED, BookingTerminationType.GOVERNANCE_TERMINATED],
    ]).get(cause);
    if (booking.terminationType !== expectedTermination) {
      this.fail(
        "Persisted Booking termination does not match the release cause.",
        "BOOKING_WALLET_RELEASE_CAUSE_CONFLICT",
      );
    }
  }

  private validateIdentity(graph: ReleaseGraph): void {
    const { booking, payment, reservation } = graph;
    if (
      booking.paymentMethod !== PaymentMethod.WALLET ||
      payment.method !== PaymentMethod.WALLET
    ) {
      this.fail(
        "Booking Payment method is not Wallet.",
        "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT",
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
        "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT",
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
        "Wallet release participant identity is inconsistent.",
        "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT",
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
        "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT",
      );
    }
    if (
      reservation.amount !== booking.totalAmount ||
      payment.amount !== reservation.amount ||
      payment.authorizedAmount !== reservation.amount
    ) {
      this.fail(
        "Wallet release amount conflicts with authorization.",
        "BOOKING_WALLET_RELEASE_AMOUNT_CONFLICT",
      );
    }
    if (
      reservation.currency !== booking.currency ||
      payment.currency !== reservation.currency
    ) {
      this.fail(
        "Wallet release currency conflicts with authorization.",
        "BOOKING_WALLET_RELEASE_CURRENCY_CONFLICT",
      );
    }
    if (!reservation.ledgerTransactionId || !reservation.reservationKey) {
      this.fail(
        "Reservation authorization identity is incomplete.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    if (booking.isFinancialLocked || booking.settlementId || payment.settlementId) {
      this.fail(
        "Booking has entered a financially locked or settled state.",
        "BOOKING_WALLET_RELEASE_COMPLETION_CONFLICT",
      );
    }
  }

  private async loadGraph(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<ReleaseGraph> {
    const booking = await bookingRepository.findById(bookingId, session);
    if (!booking) {
      this.fail("Booking not found.", "BOOKING_WALLET_RELEASE_BOOKING_NOT_FOUND");
    }
    if (!booking.paymentId) {
      this.fail("Booking Payment link is missing.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
    }
    const [payment, reservation] = await Promise.all([
      paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
      bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(
        booking._id as Types.ObjectId,
        session,
      ),
    ]);
    if (!payment) {
      this.fail("Payment not found.", "BOOKING_WALLET_RELEASE_PAYMENT_NOT_FOUND");
    }
    if (!reservation) {
      this.fail(
        "Wallet booking reservation was not found.",
        "BOOKING_WALLET_RELEASE_RESERVATION_NOT_FOUND",
      );
    }
    return { booking, payment, reservation };
  }

  private identity(graph: ReleaseGraph, cause: BookingWalletReleaseCause) {
    const { booking, payment, reservation } = graph;
    if (!booking.bookingReference || !reservation.ledgerTransactionId) {
      this.fail(
        "Wallet release identity is incomplete.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    return deriveBookingWalletReleaseIdentity({
      reservationKey: reservation.reservationKey,
      reservationReference: reservation.reservationReference,
      authorizationTransactionId: reservation.ledgerTransactionId,
      bookingId: booking._id as Types.ObjectId,
      bookingReference: booking.bookingReference,
      bookingStatus: booking.status as "REJECTED" | "EXPIRED" | "CANCELLED",
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
    graph: ReleaseGraph,
    wallet: Awaited<ReturnType<typeof walletRepository.findById>>,
    replay: boolean,
  ): SafeBookingWalletReleaseResult {
    const { booking, payment, reservation } = graph;
    if (
      !wallet ||
      !reservation.releaseReference ||
      !reservation.releaseCause ||
      !reservation.releasedAt
    ) {
      this.fail(
        "Released Wallet reservation is missing safe result data.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    return {
      booking: { bookingReference: booking.bookingReference, status: booking.status },
      payment: {
        paymentReference: payment.paymentReference,
        method: PaymentMethod.WALLET,
        status: payment.status,
        releaseReference: reservation.releaseReference,
      },
      reservation: {
        reservationReference: reservation.reservationReference,
        status: BookingFundReservationStatus.RELEASED,
        releaseReference: reservation.releaseReference,
        releaseCause: reservation.releaseCause,
        amount: reservation.amount,
        currency: reservation.currency,
        releasedAt: reservation.releasedAt,
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

  private async validateReleasedGraph(
    graph: ReleaseGraph,
    cause: BookingWalletReleaseCause,
    session?: ClientSession,
  ): Promise<SafeBookingWalletReleaseResult> {
    const { booking, payment, reservation } = graph;
    this.validateCause(booking, cause);
    this.validateIdentity(graph);
    if (reservation.status !== BookingFundReservationStatus.RELEASED) {
      this.fail(
        "Reservation is not released.",
        "BOOKING_WALLET_RELEASE_INVALID_RESERVATION_STATUS",
      );
    }
    const identity = this.identity(graph, cause);
    if (
      reservation.releaseCause !== cause ||
      reservation.releaseKey !== identity.releaseKey ||
      reservation.releaseReference !== identity.releaseReference ||
      reservation.releaseTransactionId !== identity.releaseTransactionId ||
      reservation.releaseFingerprint !== identity.releaseFingerprint ||
      !reservation.releasedAt ||
      !reservation.releaseProjectionOperationId ||
      !reservation.releaseProjectionOperationReference ||
      reservation.releaseLedgerEntryIds.length !== 2
    ) {
      this.fail(
        "Released reservation identity or links are inconsistent.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    if (
      payment.status !== targetPaymentStatus(cause) ||
      payment.releaseReference !== identity.releaseReference ||
      payment.releaseCause !== cause ||
      payment.releasedAmount !== reservation.amount ||
      !payment.releasedAt ||
      payment.releasedAt.getTime() !== reservation.releasedAt.getTime()
    ) {
      this.fail(
        "Released Payment state is inconsistent.",
        "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS",
      );
    }

    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.releaseTransactionId,
      source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      type: LedgerEntryType.BOOKING_FUNDS_RELEASED,
    }, session);
    if (entries.length !== 2) {
      this.fail(
        "Release Ledger transaction is incomplete.",
        "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT",
      );
    }
    const expectedLedgerIds = new Set(reservation.releaseLedgerEntryIds.map(String));
    const commonLedgerValid = entries.every((entry) =>
      expectedLedgerIds.has(entry._id.toString()) &&
      entry.bookingId?.toString() === booking._id.toString() &&
      entry.paymentId?.toString() === payment._id.toString() &&
      entry.userId?.toString() === reservation.userId.toString() &&
      entry.walletId?.toString() === reservation.walletId.toString() &&
      entry.amount === reservation.amount &&
      entry.currency === reservation.currency &&
      entry.metadata?.reservationReference === reservation.reservationReference &&
      entry.metadata?.releaseCause === cause);
    const reservedDebit = entries.find((entry) =>
      entry.account === LedgerAccount.WALLET_RESERVED &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.postingKey === identity.reservedPostingKey);
    const availableCredit = entries.find((entry) =>
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.postingKey === identity.availablePostingKey);
    if (!commonLedgerValid || !reservedDebit || !availableCredit) {
      this.fail(
        "Release Ledger entries do not prove the expected reclassification.",
        "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT",
      );
    }

    const projection = await walletProjectionOperationRepository.findByOperationKey(
      identity.projectionOperationKey,
      session,
    );
    const projectionLedgerIds = new Set(projection?.ledgerEntryIds.map(String) ?? []);
    if (
      !projection ||
      projection._id.toString() !== reservation.releaseProjectionOperationId.toString() ||
      projection.operationReference !== reservation.releaseProjectionOperationReference ||
      projection.walletId.toString() !== reservation.walletId.toString() ||
      projection.userId.toString() !== reservation.userId.toString() ||
      projection.currency !== reservation.currency ||
      projection.deltas.availableBalance !== reservation.amount ||
      projection.deltas.reservedBalance !== -reservation.amount ||
      projection.deltas.lockedBalance !== 0 ||
      projectionLedgerIds.size !== 2 ||
      !entries.every((entry) => projectionLedgerIds.has(entry._id.toString()))
    ) {
      this.fail(
        "Release Wallet projection is inconsistent.",
        "BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT",
      );
    }
    const wallet = await walletRepository.findById(reservation.walletId, session);
    if (
      !wallet ||
      wallet.userId.toString() !== reservation.userId.toString() ||
      wallet.currency !== reservation.currency ||
      wallet.currentBalance !==
        wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance
    ) {
      this.fail(
        "Released Wallet projection state is inconsistent.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    return this.safe(graph, wallet, true);
  }

  async validateReplay(input: {
    bookingId: Types.ObjectId;
    cause: BookingWalletReleaseCause;
    session?: ClientSession;
  }): Promise<SafeBookingWalletReleaseResult> {
    const graph = await this.loadGraph(input.bookingId, input.session);
    return this.validateReleasedGraph(graph, input.cause, input.session);
  }

  async release(input: BookingWalletReleaseInput): Promise<SafeBookingWalletReleaseResult> {
    if (!input.session.inTransaction()) {
      this.fail(
        "Wallet release requires an active transaction.",
        "BOOKING_WALLET_RELEASE_TRANSACTION_CONFLICT",
      );
    }
    const graph = await this.loadGraph(input.bookingId, input.session);
    this.validateCause(graph.booking, input.cause);
    this.validateIdentity(graph);
    const { booking, payment, reservation } = graph;

    if (reservation.status === BookingFundReservationStatus.CAPTURED) {
      this.fail(
        "Captured Wallet reservations cannot be released.",
        "BOOKING_WALLET_RELEASE_ALREADY_CAPTURED",
      );
    }
    if (reservation.status === BookingFundReservationStatus.RELEASED) {
      return this.validateReleasedGraph(graph, input.cause, input.session);
    }
    if (reservation.status !== BookingFundReservationStatus.ACTIVE) {
      this.fail(
        "Only ACTIVE Wallet reservations can be released.",
        "BOOKING_WALLET_RELEASE_INVALID_RESERVATION_STATUS",
      );
    }
    if (
      reservation.releaseReference ||
      reservation.releaseKey ||
      reservation.releaseTransactionId ||
      reservation.releaseLedgerEntryIds.length > 0 ||
      reservation.releaseProjectionOperationId ||
      reservation.releaseProjectionOperationReference ||
      reservation.releaseCause ||
      reservation.releasedAt ||
      reservation.releaseFingerprint
    ) {
      this.fail(
        "ACTIVE reservation contains partial release authority.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.SETTLED) {
      this.fail(
        "Captured or settled Wallet Payments cannot release authorization.",
        "BOOKING_WALLET_RELEASE_ALREADY_CAPTURED",
      );
    }
    if (payment.status !== PaymentStatus.AUTHORIZED) {
      this.fail(
        "Wallet Payment is not in the authorized state.",
        "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS",
      );
    }

    const identity = this.identity(graph, input.cause);
    const [existingEntries, existingProjection, existingRelease] = await Promise.all([
      ledgerEntryRepository.findManyWithPostingKeys({
        transactionId: identity.releaseTransactionId,
      }, input.session),
      walletProjectionOperationRepository.findByOperationKey(
        identity.projectionOperationKey,
        input.session,
      ),
      bookingFundReservationRepository.findByReleaseKey(
        identity.releaseKey,
        input.session,
      ),
    ]);
    if (existingEntries.length || existingProjection || existingRelease) {
      this.fail(
        "A partial or conflicting Wallet release graph already exists.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }

    let reservedDebit;
    let availableCredit;
    try {
      const common = {
        type: LedgerEntryType.BOOKING_FUNDS_RELEASED,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
        money: { amount: reservation.amount, currency: reservation.currency },
        transactionId: identity.releaseTransactionId,
        bookingId: booking._id.toString(),
        paymentId: payment._id.toString(),
        userId: reservation.userId.toString(),
        walletId: reservation.walletId.toString(),
        idempotencyKey: identity.releaseTransactionId,
        metadata: {
          reservationReference: reservation.reservationReference,
          releaseReference: identity.releaseReference,
          releaseCause: input.cause,
        },
      } as const;
      reservedDebit = await ledgerService.createDebit({
        ...common,
        account: LedgerAccount.WALLET_RESERVED,
        postingKey: identity.reservedPostingKey,
        description: "Booking Wallet reserved funds released",
      }, input.session);
      availableCredit = await ledgerService.createCredit({
        ...common,
        account: LedgerAccount.WALLET_AVAILABLE,
        postingKey: identity.availablePostingKey,
        description: "Booking Wallet available funds restored",
      }, input.session);
    } catch (error) {
      if (isTransientTransactionError(error)) throw error;
      this.fail(
        "Ledger could not record the Wallet reservation release.",
        "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT",
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
          availableBalance: reservation.amount,
          reservedBalance: -reservation.amount,
          lockedBalance: 0,
        },
        minimums: { reservedBalance: reservation.amount },
        ledgerEntryIds: [
          reservedDebit._id as Types.ObjectId,
          availableCredit._id as Types.ObjectId,
        ],
      }, input.session);
    } catch (error) {
      if (isTransientTransactionError(error)) throw error;
      if (error instanceof WalletError && error.code === "WALLET_INSUFFICIENT_BALANCE") {
        this.fail(
          "Wallet reserved balance is below the authoritative reservation amount.",
          "BOOKING_WALLET_RELEASE_INSUFFICIENT_RESERVED_BALANCE",
          error,
        );
      }
      this.fail(
        "Wallet projection could not apply the reservation release.",
        "BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT",
        error,
      );
    }

    const projection = await walletProjectionOperationRepository.findByOperationKey(
      identity.projectionOperationKey,
      input.session,
    );
    if (!projection) {
      this.fail(
        "Release projection operation is missing.",
        "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR",
      );
    }
    const releasedAt = new Date();
    const released = await bookingFundReservationRepository.guardActiveToReleased({
      reservationId: reservation._id as Types.ObjectId,
      bookingId: booking._id as Types.ObjectId,
      paymentId: payment._id as Types.ObjectId,
      walletId: reservation.walletId,
      amount: reservation.amount,
      currency: reservation.currency,
      releaseReference: identity.releaseReference,
      releaseKey: identity.releaseKey,
      releaseTransactionId: identity.releaseTransactionId,
      releaseLedgerEntryIds: [
        reservedDebit._id as Types.ObjectId,
        availableCredit._id as Types.ObjectId,
      ],
      releaseProjectionOperationId: projection._id as Types.ObjectId,
      releaseProjectionOperationReference: projection.operationReference,
      releaseCause: input.cause,
      releaseReason: input.reason?.trim(),
      releasedAt,
      releasedByType: input.actorType,
      releasedById: input.actorId,
      releaseFingerprint: identity.releaseFingerprint,
      expectedVersion: reservation.version,
    }, input.session);
    if (!released) {
      this.fail(
        "Reservation release transition conflicted.",
        "BOOKING_WALLET_RELEASE_TRANSACTION_CONFLICT",
      );
    }

    const releasedPayment = await paymentRepository.guardWalletAuthorizationToReleasedTerminal({
      paymentId: payment._id as Types.ObjectId,
      bookingId: booking._id as Types.ObjectId,
      reservationId: reservation._id as Types.ObjectId,
      reservationReference: reservation.reservationReference,
      walletId: reservation.walletId,
      amount: reservation.amount,
      currency: reservation.currency,
      targetStatus: targetPaymentStatus(input.cause),
      releaseReference: identity.releaseReference,
      releaseCause: input.cause,
      releasedAt,
    }, input.session);
    if (!releasedPayment) {
      this.fail(
        "Payment release transition conflicted.",
        "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS",
      );
    }

    const auditActor = input.actorType === BookingTerminationActorType.CUSTOMER
      ? { type: "USER" as const, id: input.actorId }
      : input.actorType === BookingTerminationActorType.CREATOR
        ? { type: "CREATOR" as const, id: input.actorId }
        : input.actorType === BookingTerminationActorType.ADMIN
          ? { type: "ADMIN" as const, id: input.actorId }
          : { type: "SYSTEM" as const, reference: "booking-wallet-release" };
    await createFinancialAudit({
      action: AuditAction.BOOKING_WALLET_RESERVATION_RELEASED,
      actor: auditActor,
      entityType: "BOOKING_FUND_RESERVATION",
      entityId: released._id as Types.ObjectId,
      financialContext: {
        domain: "BOOKING_WALLET",
        primaryReference: identity.releaseReference,
        bookingReference: booking.bookingReference,
        paymentReference: payment.paymentReference,
        amount: reservation.amount,
        currency: reservation.currency,
        ledgerTransactionReference: identity.releaseTransactionId,
        projectionOperationReference: projection.operationReference,
      },
      transition: {
        fromStatus: BookingFundReservationStatus.ACTIVE,
        toStatus: BookingFundReservationStatus.RELEASED,
        outcome: "SUCCEEDED",
      },
      metadata: { reasonCode: input.cause },
      session: input.session,
    });

    return this.safe({
      booking,
      payment: releasedPayment,
      reservation: released,
    }, wallet, false);
  }
}

export const bookingWalletReservationReleaseService =
  new BookingWalletReservationReleaseService();
