"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingFundReservationRepository = exports.BookingFundReservationRepository = void 0;
const bookingFundReservation_model_1 = require("../models/bookingFundReservation.model");
const bookingFundReservationStatus_enum_1 = require("../enums/financial/bookingFundReservationStatus.enum");
const HIDDEN_LINKS = "+reservationKey +walletId +ledgerTransactionId +ledgerEntryIds +projectionOperationId +projectionOperationReference +requestFingerprint " +
    "+releaseKey +releaseTransactionId +releaseLedgerEntryIds +releaseProjectionOperationId " +
    "+releaseProjectionOperationReference +releasedById +releaseFingerprint";
const CAPTURE_LINKS = "+captureKey +captureTransactionId +captureLedgerEntryIds +captureProjectionOperationId " +
    "+captureProjectionOperationReference +capturedById +captureFingerprint";
class BookingFundReservationRepository {
    async createOrFindDeterministicReservation(data, session) {
        const existing = await bookingFundReservation_model_1.BookingFundReservation.findOne({
            reservationKey: data.reservationKey,
        }).select(HIDDEN_LINKS).session(session).exec();
        if (existing)
            return { reservation: existing, created: false };
        const [reservation] = await bookingFundReservation_model_1.BookingFundReservation.create([data], { session });
        return { reservation, created: true };
    }
    async findByReservationReference(reservationReference, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ reservationReference })
            .session(session ?? null).exec();
    }
    async findByBooking(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId })
            .session(session ?? null).exec();
    }
    async findByBookingWithHiddenReleaseLinks(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId })
            .select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
    }
    async findActiveByBooking(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({
            bookingId,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
        }).select(HIDDEN_LINKS).session(session ?? null).exec();
    }
    async findByReleaseKey(releaseKey, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ releaseKey })
            .select(HIDDEN_LINKS).session(session ?? null).exec();
    }
    async findReleasedAuthoritative(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({
            bookingId,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED,
        }).select(HIDDEN_LINKS).session(session ?? null).exec();
    }
    async findByPayment(paymentId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ paymentId })
            .session(session ?? null).exec();
    }
    async findActiveByBookingWithCaptureFields(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({
            bookingId,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
        }).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
    }
    async findByCaptureKey(captureKey, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({ captureKey })
            .select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
    }
    async findCapturedAuthoritative(bookingId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOne({
            bookingId,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
        }).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).session(session ?? null).exec();
    }
    async loadWithHiddenFinancialLinks(reservationId, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findById(reservationId)
            .select(HIDDEN_LINKS).session(session ?? null).exec();
    }
    async markActiveFromPending(reservationId, update, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOneAndUpdate({ _id: reservationId, status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.PENDING, version: 0 }, {
            $set: { ...update, status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session }).select(HIDDEN_LINKS).exec();
    }
    async guardActiveToReleased(input, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOneAndUpdate({
            _id: input.reservationId,
            bookingId: input.bookingId,
            paymentId: input.paymentId,
            walletId: input.walletId,
            amount: input.amount,
            currency: input.currency,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
            version: input.expectedVersion,
            releaseReference: { $exists: false },
            releaseKey: { $exists: false },
            releaseTransactionId: { $exists: false },
            releaseProjectionOperationId: { $exists: false },
        }, {
            $set: {
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED,
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
        }, { new: true, runValidators: true, session }).select(HIDDEN_LINKS).exec();
    }
    async guardActiveToCaptured(input, session) {
        return bookingFundReservation_model_1.BookingFundReservation.findOneAndUpdate({
            _id: input.reservationId,
            bookingId: input.bookingId,
            paymentId: input.paymentId,
            userId: input.userId,
            walletId: input.walletId,
            creatorId: input.creatorId,
            serviceId: input.serviceId,
            amount: input.amount,
            currency: input.currency,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
            version: input.expectedVersion,
            captureReference: { $exists: false },
            captureKey: { $exists: false },
            captureTransactionId: { $exists: false },
            captureProjectionOperationId: { $exists: false },
        }, {
            $set: {
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
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
        }, { new: true, runValidators: true, session }).select(`${HIDDEN_LINKS} ${CAPTURE_LINKS}`).exec();
    }
}
exports.BookingFundReservationRepository = BookingFundReservationRepository;
exports.bookingFundReservationRepository = new BookingFundReservationRepository();
