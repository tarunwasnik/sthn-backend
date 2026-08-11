import { ClientSession, Types } from "mongoose";

import {
  BookingFundReservation,
  BookingFundReservationDocument,
} from "../models/bookingFundReservation.model";
import { BookingFundReservationStatus } from "../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletReleaseCause } from "../enums/financial/bookingWalletReleaseCause.enum";
import { BookingTerminationActorType } from "../enums/booking/bookingTerminationType.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

const HIDDEN_LINKS =
  "+reservationKey +walletId +ledgerTransactionId +ledgerEntryIds +projectionOperationId +projectionOperationReference +requestFingerprint " +
  "+releaseKey +releaseTransactionId +releaseLedgerEntryIds +releaseProjectionOperationId " +
  "+releaseProjectionOperationReference +releasedById +releaseFingerprint";
const CAPTURE_LINKS =
  "+captureKey +captureTransactionId +captureLedgerEntryIds +captureProjectionOperationId " +
  "+captureProjectionOperationReference +capturedById +captureFingerprint";

export class BookingFundReservationRepository {
  async createOrFindDeterministicReservation(
    data: Partial<BookingFundReservationDocument>,
    session: ClientSession,
  ): Promise<{ reservation: BookingFundReservationDocument; created: boolean }> {
    const existing = await BookingFundReservation.findOne({
      reservationKey: data.reservationKey,
    }).select(HIDDEN_LINKS).session(session).exec();
    if (existing) return { reservation: existing, created: false };
    const [reservation] = await BookingFundReservation.create([data], { session });
    return { reservation, created: true };
  }

  async findByReservationReference(
    reservationReference: string,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ reservationReference })
      .session(session ?? null).exec();
  }

  async findByBooking(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ bookingId })
      .session(session ?? null).exec();
  }

  async findByBookingWithHiddenReleaseLinks(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ bookingId })
      .select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
  }

  async findActiveByBooking(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({
      bookingId,
      status: BookingFundReservationStatus.ACTIVE,
    }).select(HIDDEN_LINKS).session(session ?? null).exec();
  }

  async findByReleaseKey(
    releaseKey: string,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ releaseKey })
      .select(HIDDEN_LINKS).session(session ?? null).exec();
  }

  async findReleasedAuthoritative(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({
      bookingId,
      status: BookingFundReservationStatus.RELEASED,
    }).select(HIDDEN_LINKS).session(session ?? null).exec();
  }

  async findByPayment(
    paymentId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ paymentId })
      .session(session ?? null).exec();
  }

  async findActiveByBookingWithCaptureFields(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({
      bookingId,
      status: BookingFundReservationStatus.ACTIVE,
    }).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
  }

  async findByCaptureKey(
    captureKey: string,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({ captureKey })
      .select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
  }

  async findCapturedAuthoritative(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOne({
      bookingId,
      status: BookingFundReservationStatus.CAPTURED,
    }).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
  }

  async loadWithHiddenFinancialLinks(
    reservationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findById(reservationId)
      .select(HIDDEN_LINKS).session(session ?? null).exec();
  }

  async markActiveFromPending(
    reservationId: Types.ObjectId,
    update: {
      ledgerTransactionId: string;
      ledgerEntryIds: Types.ObjectId[];
      projectionOperationId: Types.ObjectId;
      projectionOperationReference: string;
      authorizedAt: Date;
    },
    session: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOneAndUpdate(
      { _id: reservationId, status: BookingFundReservationStatus.PENDING, version: 0 },
      {
        $set: { ...update, status: BookingFundReservationStatus.ACTIVE },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    ).select(HIDDEN_LINKS).exec();
  }

  async guardActiveToReleased(
    input: {
      reservationId: Types.ObjectId;
      bookingId: Types.ObjectId;
      paymentId: Types.ObjectId;
      walletId: Types.ObjectId;
      amount: number;
      currency: string;
      releaseReference: string;
      releaseKey: string;
      releaseTransactionId: string;
      releaseLedgerEntryIds: Types.ObjectId[];
      releaseProjectionOperationId: Types.ObjectId;
      releaseProjectionOperationReference: string;
      releaseCause: BookingWalletReleaseCause;
      releaseReason?: string;
      releasedAt: Date;
      releasedByType: BookingTerminationActorType;
      releasedById?: Types.ObjectId;
      releaseFingerprint: string;
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOneAndUpdate(
      {
        _id: input.reservationId,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        walletId: input.walletId,
        amount: input.amount,
        currency: input.currency,
        status: BookingFundReservationStatus.ACTIVE,
        version: input.expectedVersion,
        releaseReference: { $exists: false },
        releaseKey: { $exists: false },
        releaseTransactionId: { $exists: false },
        releaseProjectionOperationId: { $exists: false },
      },
      {
        $set: {
          status: BookingFundReservationStatus.RELEASED,
          releaseReference: input.releaseReference,
          releaseKey: input.releaseKey,
          releaseTransactionId: input.releaseTransactionId,
          releaseLedgerEntryIds: input.releaseLedgerEntryIds,
          releaseProjectionOperationId: input.releaseProjectionOperationId,
          releaseProjectionOperationReference: input.releaseProjectionOperationReference,
          releaseCause: input.releaseCause,
          ...(input.releaseReason ? { releaseReason: input.releaseReason } : {}),
          releasedAt: input.releasedAt,
          releasedByType: input.releasedByType,
          ...(input.releasedById ? { releasedById: input.releasedById } : {}),
          releaseFingerprint: input.releaseFingerprint,
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    ).select(HIDDEN_LINKS).exec();
  }

  async guardActiveToCaptured(
    input: {
      reservationId: Types.ObjectId;
      bookingId: Types.ObjectId;
      paymentId: Types.ObjectId;
      userId: Types.ObjectId;
      walletId: Types.ObjectId;
      creatorId: Types.ObjectId;
      serviceId: Types.ObjectId;
      amount: number;
      currency: string;
      captureReference: string;
      captureKey: string;
      captureTransactionId: string;
      captureLedgerEntryIds: Types.ObjectId[];
      captureProjectionOperationId: Types.ObjectId;
      captureProjectionOperationReference: string;
      captureCause: BookingWalletCaptureCause;
      capturedAt: Date;
      capturedByType: BookingCompletionActorType;
      capturedById?: Types.ObjectId;
      captureFingerprint: string;
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingFundReservationDocument | null> {
    return BookingFundReservation.findOneAndUpdate(
      {
        _id: input.reservationId,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        userId: input.userId,
        walletId: input.walletId,
        creatorId: input.creatorId,
        serviceId: input.serviceId,
        amount: input.amount,
        currency: input.currency,
        status: BookingFundReservationStatus.ACTIVE,
        version: input.expectedVersion,
        captureReference: { $exists: false },
        captureKey: { $exists: false },
        captureTransactionId: { $exists: false },
        captureProjectionOperationId: { $exists: false },
      },
      {
        $set: {
          status: BookingFundReservationStatus.CAPTURED,
          captureReference: input.captureReference,
          captureKey: input.captureKey,
          captureTransactionId: input.captureTransactionId,
          captureLedgerEntryIds: input.captureLedgerEntryIds,
          captureProjectionOperationId: input.captureProjectionOperationId,
          captureProjectionOperationReference: input.captureProjectionOperationReference,
          captureCause: input.captureCause,
          capturedAt: input.capturedAt,
          capturedByType: input.capturedByType,
          ...(input.capturedById ? { capturedById: input.capturedById } : {}),
          captureFingerprint: input.captureFingerprint,
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session },
    ).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).exec();
  }
}

export const bookingFundReservationRepository =
  new BookingFundReservationRepository();
