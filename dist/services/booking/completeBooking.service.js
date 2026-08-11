"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeBookingAutomatically = exports.completeBookingService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bookingWalletCaptureCause_enum_1 = require("../../enums/financial/bookingWalletCaptureCause.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingWalletReservationCaptureError_1 = require("../../errors/financial/BookingWalletReservationCaptureError");
const booking_model_1 = require("../../models/booking.model");
const dispute_model_1 = require("../../models/dispute.model");
const slot_model_1 = require("../../models/slot.model");
const booking_repository_1 = require("../../repositories/booking.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const featureFlagGuard_service_1 = require("../controlPlane/featureFlagGuard.service");
const bookingWalletReservationCapture_service_1 = require("../financial/bookingWalletReservationCapture.service");
const suspensionFinalizer_service_1 = require("../accountGovernance/suspensionFinalizer.service");
const bookingCompletionTiming_service_1 = require("./bookingCompletionTiming.service");
const operationKey = (bookingId) => `booking-completion:${bookingId}`;
const assertAutoTiming = async (slotIds, session) => {
    const slots = await slot_model_1.Slot.find({ _id: { $in: slotIds } }, { _id: 1, endTime: 1 }, { session });
    if (slots.length !== slotIds.length) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Completion slot identity is incomplete.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
    }
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    if (slots.some((slot) => slot.endTime.getTime() + tenMinutes > now)) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking is not yet eligible for automatic completion.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
    }
};
const completeBookingApplication = async (input) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.bookingId)) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking not found.", "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND");
    }
    const bookingId = new mongoose_1.Types.ObjectId(input.bookingId);
    const completionKey = operationKey(input.bookingId);
    const initial = await booking_model_1.Booking.findById(bookingId);
    if (!initial) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking not found.", "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND");
    }
    if (input.actorType === bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR &&
        initial.creatorId.toString() !== input.actorId) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Creator is not authorized to complete this Booking.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
    }
    if (initial.status === "COMPLETED") {
        if (initial.completionOperationKey !== completionKey ||
            initial.completionCause !== input.cause) {
            throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking already has a conflicting completion.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
        }
        if (initial.paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
            return bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.validateReplay({
                bookingId,
                cause: input.cause,
            });
        }
        const payment = initial.paymentId
            ? await payment_repository_1.paymentRepository.findById(initial.paymentId)
            : null;
        return { booking: initial, payment, replay: true };
    }
    const actorId = input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId)
        ? new mongoose_1.Types.ObjectId(input.actorId)
        : undefined;
    const session = await mongoose_1.default.startSession();
    let result;
    let affectedUserId = null;
    let affectedCreatorId = null;
    try {
        await session.withTransaction(async () => {
            const booking = await booking_repository_1.bookingRepository.findById(bookingId, session);
            if (!booking) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking not found.", "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND");
            }
            if (booking.status !== "CONFIRMED") {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Only a confirmed Booking can be completed.", "BOOKING_WALLET_CAPTURE_INVALID_BOOKING_STATUS");
            }
            if (input.actorType === bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR &&
                booking.creatorId.toString() !== input.actorId) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Creator is not authorized to complete this Booking.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
            }
            if (booking.isFinancialLocked) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Financial operations are locked for this Booking.", "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED");
            }
            if (await dispute_model_1.Dispute.exists({ bookingId, status: "OPEN" }).session(session)) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("An OPEN dispute blocks Booking completion.", "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN");
            }
            if (!booking.isPayable || booking.paymentStatus === "REFUNDED") {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking is not payable.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
            }
            if (booking.isPayoutEligible || booking.settlementId) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking has entered a later financial lifecycle.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
            }
            if (booking.creatorEarningSnapshot !== undefined ||
                booking.platformCommissionSnapshot !== undefined) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking already contains allocation snapshots.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
            }
            if (!booking.paymentId) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking Payment was not found.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
            }
            const payment = await payment_repository_1.paymentRepository.findByIdWithWalletLinks(booking.paymentId, session);
            if (!payment) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking Payment was not found.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
            }
            if (booking.paymentMethod !== payment.method) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking and Payment methods conflict.", "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT");
            }
            if (input.cause === bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.AUTO_COMPLETED) {
                await assertAutoTiming(booking.slotIds, session);
            }
            if (payment.method === paymentMethod_enum_1.PaymentMethod.INTERNAL &&
                payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Internal-provider Payment is not captured.", "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS");
            }
            const timing = (0, bookingCompletionTiming_service_1.createBookingCompletionTiming)();
            const completed = await booking_repository_1.bookingRepository.guardConfirmedToCompleted({
                bookingId,
                cause: input.cause,
                actorType: input.actorType,
                actorId,
                operationKey: completionKey,
                completedAt: timing.completedAt,
                settlementEligibleAt: timing.settlementEligibleAt,
            }, session);
            if (!completed) {
                throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Booking completion transition conflicted.", "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT");
            }
            affectedUserId = completed.userId.toString();
            affectedCreatorId = completed.creatorId.toString();
            if (payment.method === paymentMethod_enum_1.PaymentMethod.WALLET) {
                result = await bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.capture({
                    bookingId,
                    cause: input.cause,
                    actorType: input.actorType,
                    actorId,
                    session,
                });
            }
            else {
                result = { booking: completed, payment, replay: false };
            }
        });
    }
    catch (error) {
        const winner = await booking_repository_1.bookingRepository.findCompletedReplay(bookingId, completionKey);
        if (winner?.completionCause === input.cause &&
            winner.paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
            return bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.validateReplay({
                bookingId,
                cause: input.cause,
            });
        }
        if (winner?.completionCause === input.cause) {
            const payment = winner.paymentId
                ? await payment_repository_1.paymentRepository.findById(winner.paymentId)
                : null;
            return { booking: winner, payment, replay: true };
        }
        throw error;
    }
    finally {
        await session.endSession();
    }
    if (input.actorType === bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR) {
        if (affectedUserId)
            await (0, suspensionFinalizer_service_1.finalizePendingSuspension)({ userId: affectedUserId });
        if (affectedCreatorId && affectedCreatorId !== affectedUserId) {
            await (0, suspensionFinalizer_service_1.finalizePendingSuspension)({ userId: affectedCreatorId });
        }
    }
    return result;
};
const completeBookingService = async ({ bookingId, creatorId, role, }) => {
    await featureFlagGuard_service_1.FeatureFlagGuard.requireEnabled("BOOKING_COMPLETION_ENABLED", { userId: creatorId, role }, "Booking completion is temporarily disabled");
    if (role !== "creator") {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError("Only the authenticated Creator may complete this Booking.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
    }
    return completeBookingApplication({
        bookingId,
        cause: bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.CREATOR_COMPLETED,
        actorType: bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR,
        actorId: creatorId,
    });
};
exports.completeBookingService = completeBookingService;
const completeBookingAutomatically = (bookingId) => completeBookingApplication({
    bookingId,
    cause: bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.AUTO_COMPLETED,
    actorType: bookingWalletCaptureCause_enum_1.BookingCompletionActorType.SYSTEM,
});
exports.completeBookingAutomatically = completeBookingAutomatically;
