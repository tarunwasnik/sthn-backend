"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingFinancialTerminationService = exports.BookingFinancialTerminationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const bookingTerminationType_enum_1 = require("../../enums/booking/bookingTerminationType.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
const BookingTerminationError_1 = require("../../errors/booking/BookingTerminationError");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const booking_repository_1 = require("../../repositories/booking.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const providerPayment_service_1 = __importDefault(require("../internalProvider/payments/providerPayment.service"));
const providerRefund_service_1 = __importDefault(require("../internalProvider/refunds/providerRefund.service"));
const providerEvent_service_1 = __importDefault(require("../internalProvider/events/providerEvent.service"));
const internalProvider_1 = require("../../constants/internalProvider");
const paymentProviderRegistry_service_1 = require("./paymentProviderRegistry.service");
const refund_service_1 = require("./refund.service");
const booking_model_1 = require("../../models/booking.model");
const slot_model_1 = require("../../models/slot.model");
const escrowRecognition_service_1 = require("./escrowRecognition.service");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const bookingWalletReservationRelease_service_1 = require("./bookingWalletReservationRelease.service");
const BookingWalletReservationReleaseError_1 = require("../../errors/financial/BookingWalletReservationReleaseError");
class BookingFinancialTerminationService {
    operationKey(bookingId) { return `booking-termination:${bookingId}`; }
    targetStatus(type) {
        if (type === bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED)
            return "REJECTED";
        if (type === bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED)
            return "EXPIRED";
        return "CANCELLED";
    }
    async authorize(input, booking) {
        if (!booking)
            throw new BookingTerminationError_1.BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
        if ((input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CUSTOMER && booking.userId.toString() !== input.actorId) ||
            (input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR && booking.creatorId.toString() !== input.actorId)) {
            throw new BookingTerminationError_1.BookingTerminationError("Actor is not authorized to terminate this booking.", "BOOKING_ACTOR_NOT_AUTHORIZED", 403);
        }
    }
    actionFor(paymentStatus, providerStatus) {
        if ([paymentStatus_enum_1.PaymentStatus.FAILED, paymentStatus_enum_1.PaymentStatus.CANCELLED, paymentStatus_enum_1.PaymentStatus.EXPIRED, paymentStatus_enum_1.PaymentStatus.REFUNDED].includes(paymentStatus))
            return "NONE";
        if (paymentStatus === paymentStatus_enum_1.PaymentStatus.SETTLED || paymentStatus === paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED) {
            throw new PaymentError_1.PaymentError("This Payment requires a later settlement or refund workflow.", "PAYMENT_TERMINATION_NOT_ALLOWED");
        }
        if (providerStatus === internalProvider_1.ProviderStatus.CAPTURED || paymentStatus === paymentStatus_enum_1.PaymentStatus.CAPTURED)
            return "REFUND";
        if (providerStatus === internalProvider_1.ProviderStatus.REFUNDED)
            return "NONE";
        if (providerStatus === internalProvider_1.ProviderStatus.CANCELLED)
            return "NONE";
        return "CANCEL";
    }
    async terminateBookingFinancially(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.bookingId))
            throw new BookingTerminationError_1.BookingTerminationError("Invalid booking id.", "BOOKING_NOT_FOUND", 400);
        const booking = await booking_model_1.Booking.findById(input.bookingId);
        await this.authorize(input, booking);
        if (!booking)
            throw new BookingTerminationError_1.BookingTerminationError("Booking not found.", "BOOKING_NOT_FOUND", 404);
        const operationKey = this.operationKey(booking._id.toString());
        const targetStatus = this.targetStatus(input.terminationType);
        if (["CANCELLED", "REJECTED", "EXPIRED"].includes(booking.status)) {
            if (booking.terminationOperationKey === operationKey && booking.terminationType === input.terminationType) {
                const terminalPayment = booking.paymentId
                    ? await payment_repository_1.paymentRepository.findById(booking.paymentId)
                    : null;
                if (terminalPayment?.method === paymentMethod_enum_1.PaymentMethod.WALLET) {
                    const cause = (0, bookingWalletReservationRelease_service_1.bookingWalletReleaseCauseForTermination)(input.terminationType);
                    if (!cause) {
                        throw new BookingTerminationError_1.BookingTerminationError("This Wallet booking termination cause cannot release a reservation.", "BOOKING_TERMINATION_CONFLICT", 409);
                    }
                    const replay = await bookingWalletReservationRelease_service_1.bookingWalletReservationReleaseService.validateReplay({
                        bookingId: booking._id,
                        cause,
                    });
                    return { ...replay, financialAction: "RELEASE", replay: true };
                }
                return { booking, payment: terminalPayment, financialAction: "NONE", replay: true };
            }
            throw new BookingTerminationError_1.BookingTerminationError("Booking already has a conflicting terminal outcome.", "BOOKING_TERMINATION_CONFLICT", 409);
        }
        if (booking.status === "COMPLETED")
            throw new BookingTerminationError_1.BookingTerminationError("Completed bookings cannot be terminated by this workflow.", "BOOKING_ALREADY_COMPLETED", 409);
        if (input.terminationType === bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED &&
            booking.status !== "REQUESTED") {
            throw new BookingTerminationError_1.BookingTerminationError("Only a requested booking can be rejected.", "BOOKING_TERMINATION_CONFLICT", 409);
        }
        if (input.terminationType === bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED) {
            if (input.actorType !== bookingTerminationType_enum_1.BookingTerminationActorType.SYSTEM ||
                booking.status !== "REQUESTED" ||
                !booking.expiresAt ||
                booking.expiresAt.getTime() > Date.now()) {
                throw new BookingTerminationError_1.BookingTerminationError("Only an expired requested booking can be expired by the system.", "BOOKING_TERMINATION_CONFLICT", 409);
            }
        }
        const payment = booking.paymentId ? await payment_repository_1.paymentRepository.findById(booking.paymentId) : null;
        if (payment && booking.paymentMethod !== payment.method) {
            throw new BookingWalletReservationReleaseError_1.BookingWalletReservationReleaseError("Booking and Payment method links are inconsistent.", "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT");
        }
        let action = "NONE";
        let providerStatus;
        let providerPayment = null;
        if (payment?.providerPaymentId) {
            providerPayment = await providerPayment_service_1.default.findByProviderPaymentId(payment.providerPaymentId);
            if (!providerPayment || !providerPayment.paymentId.equals(payment._id))
                throw new PaymentError_1.PaymentError("Provider payment does not belong to the Financial Payment.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
            if (providerPayment.amount !== payment.amount)
                throw new PaymentError_1.PaymentError("Provider payment amount does not match Financial Payment.", "PAYMENT_PROVIDER_AMOUNT_MISMATCH");
            if (providerPayment.currency !== payment.currency)
                throw new PaymentError_1.PaymentError("Provider payment currency does not match Financial Payment.", "PAYMENT_PROVIDER_CURRENCY_MISMATCH");
            providerStatus = providerPayment.status;
        }
        const walletReleaseCause = payment?.method === paymentMethod_enum_1.PaymentMethod.WALLET
            ? (0, bookingWalletReservationRelease_service_1.bookingWalletReleaseCauseForTermination)(input.terminationType)
            : null;
        if (payment?.method === paymentMethod_enum_1.PaymentMethod.WALLET) {
            if (!walletReleaseCause) {
                throw new BookingTerminationError_1.BookingTerminationError("This termination cause is not eligible for Wallet reservation release.", "BOOKING_TERMINATION_CONFLICT", 409);
            }
            action = "RELEASE";
        }
        else if (payment) {
            action = this.actionFor(payment.status, providerStatus);
        }
        if (payment && action === "CANCEL" && payment.providerPaymentId) {
            const provider = paymentProviderRegistry_service_1.paymentProviderRegistry.get(payment.provider);
            const result = await provider.cancelPayment({ providerPaymentId: payment.providerPaymentId });
            if (result.providerStatus !== internalProvider_1.ProviderStatus.CANCELLED)
                throw new PaymentError_1.PaymentError("Provider cancellation did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
            const events = await providerEvent_service_1.default.getPaymentTimeline(payment.providerPaymentId);
            if (!events.some((event) => event.operation === internalProvider_1.ProviderOperation.CANCEL_PAYMENT))
                throw new PaymentError_1.PaymentError("Provider cancellation event is missing.", "PAYMENT_PROVIDER_STATE_MISMATCH");
            providerStatus = result.providerStatus;
        }
        if (payment && action === "REFUND") {
            if (!payment.providerPaymentId)
                throw new PaymentError_1.PaymentError("Captured Payment is missing a provider payment identifier.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
            const refundKey = `${operationKey}:full-refund`;
            let refund = await refund_service_1.refundService.findByIdempotencyKey(refundKey);
            if (!refund)
                refund = await refund_service_1.refundService.createRefund({ paymentId: payment._id.toString(), bookingId: booking._id.toString(), userId: payment.userId.toString(), creatorId: payment.creatorId.toString(), amount: { amount: payment.amount, currency: payment.currency }, reason: undefined, provider: payment.provider, providerPaymentId: payment.providerPaymentId, idempotencyKey: refundKey });
            const auditActor = input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CUSTOMER && input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId)
                ? { type: "USER", id: new mongoose_1.default.Types.ObjectId(input.actorId) }
                : input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR && input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId)
                    ? { type: "CREATOR", id: new mongoose_1.default.Types.ObjectId(input.actorId) }
                    : { type: "SYSTEM", reference: "booking-termination" };
            await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.REFUND_REQUESTED, actor: auditActor, entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider }, transition: { outcome: "PROCESSING" } });
            const provider = paymentProviderRegistry_service_1.paymentProviderRegistry.get(payment.provider);
            const result = await provider.createRefund({ refundId: refund._id.toString(), bookingId: booking._id.toString(), refundReference: refund.refundReference, paymentReference: payment.paymentReference, providerPaymentId: payment.providerPaymentId, amount: { amount: payment.amount, currency: payment.currency }, idempotencyKey: refundKey });
            await refund_service_1.refundService.updateProviderReferences(refund._id.toString(), { providerRefundId: result.providerRefundId, providerPaymentId: payment.providerPaymentId });
            if (result.payload)
                await refund_service_1.refundService.updateProviderPayload(refund._id.toString(), result.payload);
            if (result.providerStatus !== "REFUNDED")
                throw new PaymentError_1.PaymentError("Provider refund did not complete.", "PAYMENT_PROVIDER_STATE_MISMATCH");
            await refund_service_1.refundService.markCompleted(refund._id.toString(), result.providerRefundId);
            await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.REFUND_COMPLETED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "REFUND", entityId: refund._id, financialContext: { domain: "REFUND", primaryReference: refund.refundReference, refundReference: refund.refundReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider, providerReference: result.providerRefundId }, transition: { outcome: "SUCCEEDED" } });
            const providerRefund = await providerRefund_service_1.default.findByProviderRefundId(result.providerRefundId);
            if (!providerRefund || providerRefund.refundId.toString() !== refund._id.toString() || providerRefund.amount !== payment.amount || providerRefund.currency !== payment.currency)
                throw new PaymentError_1.PaymentError("Provider refund identity is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
            providerStatus = internalProvider_1.ProviderStatus.REFUNDED;
        }
        const session = await mongoose_1.default.startSession();
        let finalBooking = null;
        let finalPayment = payment;
        let walletReleaseResult = null;
        let transactionError;
        try {
            await session.withTransaction(async () => {
                if (payment && action !== "RELEASE") {
                    const currentPayment = await payment_repository_1.paymentRepository.findById(payment._id, session);
                    if (!currentPayment)
                        throw new PaymentError_1.PaymentError("Payment not found.", "PAYMENT_NOT_FOUND");
                    const target = action === "REFUND" || providerStatus === internalProvider_1.ProviderStatus.REFUNDED ? paymentStatus_enum_1.PaymentStatus.REFUNDED : action === "CANCEL" || providerStatus === internalProvider_1.ProviderStatus.CANCELLED ? paymentStatus_enum_1.PaymentStatus.CANCELLED : currentPayment.status;
                    if (target !== currentPayment.status) {
                        if (target === paymentStatus_enum_1.PaymentStatus.REFUNDED) {
                            await escrowRecognition_service_1.escrowRecognitionService.recognizeFullRefund(currentPayment, session);
                        }
                        const transitioned = await payment_repository_1.paymentRepository.transition(currentPayment._id, [currentPayment.status], { status: target, failureReason: target === paymentStatus_enum_1.PaymentStatus.CANCELLED ? paymentFailureReason_enum_1.PaymentFailureReason.PAYMENT_CANCELLED : currentPayment.failureReason }, session);
                        if (!transitioned)
                            throw new PaymentError_1.PaymentError("Payment termination transition conflicted.", "PAYMENT_LIFECYCLE_CONFLICT");
                        finalPayment = transitioned;
                    }
                    else
                        finalPayment = currentPayment;
                }
                const actorId = input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId) ? new mongoose_1.default.Types.ObjectId(input.actorId) : undefined;
                finalBooking = await booking_repository_1.bookingRepository.transitionToTerminated({ bookingId: booking._id, expectedStatuses: ["REQUESTED", "CONFIRMED"], targetStatus, terminationType: input.terminationType, terminationActorType: input.actorType, terminationActorId: actorId, terminationReason: input.reason?.trim(), terminationOperationKey: operationKey }, session);
                if (!finalBooking)
                    throw new BookingTerminationError_1.BookingTerminationError("Booking termination transition conflicted.", "BOOKING_TERMINATION_CONFLICT", 409);
                const slotRelease = await slot_model_1.Slot.updateMany({ _id: { $in: finalBooking.slotIds }, status: { $in: ["LOCKED", "BOOKED"] } }, { $set: { status: "AVAILABLE" } }, { session });
                if (action === "RELEASE" && slotRelease.modifiedCount !== finalBooking.slotIds.length) {
                    throw new BookingTerminationError_1.BookingTerminationError("Wallet booking slots could not be released atomically.", "BOOKING_TERMINATION_CONFLICT", 409);
                }
                if (action === "RELEASE" && walletReleaseCause) {
                    const actorId = input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId)
                        ? new mongoose_1.default.Types.ObjectId(input.actorId)
                        : undefined;
                    walletReleaseResult = await bookingWalletReservationRelease_service_1.bookingWalletReservationReleaseService.release({
                        bookingId: booking._id,
                        cause: walletReleaseCause,
                        actorType: input.actorType,
                        actorId,
                        reason: input.reason,
                        session,
                    });
                }
            });
        }
        catch (error) {
            transactionError = error;
        }
        finally {
            await session.endSession();
        }
        if (transactionError) {
            if (action === "RELEASE" && walletReleaseCause) {
                const winner = await booking_model_1.Booking.findById(booking._id);
                if (winner &&
                    winner.terminationOperationKey === operationKey &&
                    winner.terminationType === input.terminationType &&
                    winner.status === targetStatus) {
                    const replay = await bookingWalletReservationRelease_service_1.bookingWalletReservationReleaseService.validateReplay({
                        bookingId: winner._id,
                        cause: walletReleaseCause,
                    });
                    return { ...replay, financialAction: "RELEASE", replay: true };
                }
            }
            throw transactionError;
        }
        if (action === "RELEASE") {
            const committedRelease = walletReleaseResult;
            if (!committedRelease) {
                throw new BookingTerminationError_1.BookingTerminationError("Wallet booking release did not complete.", "BOOKING_TERMINATION_CONFLICT", 409);
            }
            return { ...committedRelease, financialAction: "RELEASE" };
        }
        return { booking: finalBooking, payment: finalPayment, financialAction: action, replay: false };
    }
}
exports.BookingFinancialTerminationService = BookingFinancialTerminationService;
exports.bookingFinancialTerminationService = new BookingFinancialTerminationService();
