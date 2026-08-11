"use strict";
// backend/src/repositories/payment.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRepository = exports.PaymentRepository = void 0;
const payment_model_1 = require("../models/payment.model");
const paymentStatus_enum_1 = require("../enums/financial/paymentStatus.enum");
const paymentMethod_enum_1 = require("../enums/financial/paymentMethod.enum");
/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Repository
 * ============================================================
 *
 * Responsibility
 * --------------
 * Handles persistence operations for Payments.
 *
 * IMPORTANT
 * ---------
 * - No business logic.
 * - No payment processing.
 * - No provider communication.
 * - No financial decisions.
 * ============================================================
 */
class PaymentRepository {
    async create(data, session) {
        if (session) {
            const payment = new payment_model_1.Payment(data);
            await payment.save({ session });
            return payment;
        }
        return payment_model_1.Payment.create(data);
    }
    async findById(id, session) {
        return payment_model_1.Payment.findById(id).session(session ?? null).exec();
    }
    async findByIdWithWalletLinks(id, session) {
        return payment_model_1.Payment.findById(id)
            .select("+walletId +reservationId")
            .session(session ?? null).exec();
    }
    async findByPaymentReference(paymentReference) {
        return payment_model_1.Payment.findOne({ paymentReference }).exec();
    }
    async findByBookingId(bookingId) {
        return payment_model_1.Payment.find({ bookingId }).sort({ createdAt: -1 }).exec();
    }
    async findByBookingAndStatus(bookingId, status) {
        return payment_model_1.Payment.findOne({
            bookingId,
            status,
        }).exec();
    }
    async findByUserId(userId) {
        return payment_model_1.Payment.find({ userId }).sort({ createdAt: -1 }).exec();
    }
    async findByCreatorId(creatorId) {
        return payment_model_1.Payment.find({ creatorId }).sort({ createdAt: -1 }).exec();
    }
    async findByStatus(status) {
        return payment_model_1.Payment.find({ status }).sort({ createdAt: -1 }).exec();
    }
    async findByProviderPaymentId(providerPaymentId) {
        return payment_model_1.Payment.findOne({
            providerPaymentId,
        }).exec();
    }
    async findByProviderOrderId(providerOrderId) {
        return payment_model_1.Payment.findOne({
            providerOrderId,
        }).exec();
    }
    async findByProviderTransactionId(providerTransactionId) {
        return payment_model_1.Payment.findOne({
            providerTransactionId,
        }).exec();
    }
    async findByIdempotencyKey(idempotencyKey) {
        return payment_model_1.Payment.findOne({
            idempotencyKey,
        }).exec();
    }
    async findOne(filter) {
        return payment_model_1.Payment.findOne(filter).exec();
    }
    async findMany(filter) {
        return payment_model_1.Payment.find(filter).sort({ createdAt: -1 }).exec();
    }
    async transition(id, expectedStatuses, update, session) {
        return payment_model_1.Payment.findOneAndUpdate({ _id: id, status: { $in: expectedStatuses } }, { ...update, $inc: { lifecycleVersion: 1 } }, { new: true, runValidators: true, session }).exec();
    }
    async guardWalletAuthorizationToReleasedTerminal(input, session) {
        return payment_model_1.Payment.findOneAndUpdate({
            _id: input.paymentId,
            bookingId: input.bookingId,
            method: paymentMethod_enum_1.PaymentMethod.WALLET,
            status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
            reservationId: input.reservationId,
            reservationReference: input.reservationReference,
            walletId: input.walletId,
            authorizedAmount: input.amount,
            amount: input.amount,
            currency: input.currency,
            releasedAt: { $exists: false },
            releaseReference: { $exists: false },
        }, {
            $set: {
                status: input.targetStatus,
                releaseReference: input.releaseReference,
                releasedAmount: input.amount,
                releaseCause: input.releaseCause,
                releasedAt: input.releasedAt,
                retryable: false,
            },
            $inc: { lifecycleVersion: 1 },
        }, { new: true, runValidators: true, session }).exec();
    }
    async guardWalletAuthorizedToCaptured(input, session) {
        return payment_model_1.Payment.findOneAndUpdate({
            _id: input.paymentId,
            bookingId: input.bookingId,
            method: paymentMethod_enum_1.PaymentMethod.WALLET,
            status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
            reservationId: input.reservationId,
            reservationReference: input.reservationReference,
            walletId: input.walletId,
            authorizedAmount: input.amount,
            amount: input.amount,
            currency: input.currency,
            capturedAt: { $exists: false },
            captureReference: { $exists: false },
            releasedAt: { $exists: false },
            releaseReference: { $exists: false },
        }, {
            $set: {
                status: paymentStatus_enum_1.PaymentStatus.CAPTURED,
                captureReference: input.captureReference,
                capturedAmount: input.amount,
                captureCause: input.captureCause,
                capturedAt: input.capturedAt,
                escrowRecognizedAt: input.capturedAt,
                escrowLedgerTransactionReference: input.captureTransactionId,
                retryable: false,
            },
            $inc: { lifecycleVersion: 1 },
        }, { new: true, runValidators: true, session }).select("+walletId +reservationId").exec();
    }
    async findWalletCapturedAuthoritative(paymentId, session) {
        return payment_model_1.Payment.findOne({
            _id: paymentId,
            method: paymentMethod_enum_1.PaymentMethod.WALLET,
            status: paymentStatus_enum_1.PaymentStatus.CAPTURED,
        }).select("+walletId +reservationId").session(session ?? null).exec();
    }
    async markEscrowRecognized(id, transactionReference, recognizedAt, session) {
        return payment_model_1.Payment.findOneAndUpdate({ _id: id, status: paymentStatus_enum_1.PaymentStatus.CAPTURED, escrowRecognizedAt: { $exists: false } }, { $set: { escrowRecognizedAt: recognizedAt, escrowLedgerTransactionReference: transactionReference } }, { new: true, runValidators: true, session }).exec();
    }
    async updateReconciliation(id, update, session) {
        const snapshotFields = ["serviceAmount", "customerFeeRateBps", "customerFeeAmount", "grossEscrowAmount", "pricingPolicy", "pricingVersion"];
        const fillsPricingSnapshot = snapshotFields.some((field) => field in update);
        const filter = { _id: id };
        if (fillsPricingSnapshot) {
            // Historical reconciliation may fill a wholly absent snapshot once, but
            // never overwrite a partially or fully established financial snapshot.
            filter.serviceAmount = { $exists: false };
            filter.customerFeeRateBps = { $exists: false };
            filter.customerFeeAmount = { $exists: false };
            filter.grossEscrowAmount = { $exists: false };
            filter.pricingPolicy = { $exists: false };
            filter.pricingVersion = { $exists: false };
        }
        return payment_model_1.Payment.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true, session }).exec();
    }
    async exists(filter) {
        const result = await payment_model_1.Payment.exists(filter);
        return result !== null;
    }
    async count(filter = {}) {
        return payment_model_1.Payment.countDocuments(filter).exec();
    }
}
exports.PaymentRepository = PaymentRepository;
exports.paymentRepository = new PaymentRepository();
