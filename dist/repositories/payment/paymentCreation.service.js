"use strict";
// backend/src/services/payment/paymentCreation.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentCreationService = exports.PaymentCreationService = void 0;
const crypto_1 = require("crypto");
const payment_repository_1 = require("../../repositories/payment.repository");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
class PaymentCreationService {
    /**
     * Creates a new Payment.
     */
    async createPayment(input) {
        const idempotencyKey = input.idempotencyKey ?? (0, crypto_1.randomUUID)();
        const existing = await payment_repository_1.paymentRepository.findByIdempotencyKey(idempotencyKey);
        if (existing) {
            return existing;
        }
        const paymentReference = this.generatePaymentReference();
        const payment = await payment_repository_1.paymentRepository.create({
            paymentReference,
            bookingId: input.bookingId,
            userId: input.userId,
            creatorId: input.creatorId,
            amount: input.amount,
            currency: input.currency,
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            method: input.method ?? paymentMethod_enum_1.PaymentMethod.INTERNAL,
            status: paymentStatus_enum_1.PaymentStatus.CREATED,
            idempotencyKey,
            attemptNumber: 1,
            retryable: true,
            failureReason: paymentFailureReason_enum_1.PaymentFailureReason.NONE,
        });
        return payment;
    }
    /**
     * Generates an internal immutable payment reference.
     */
    generatePaymentReference() {
        return `PAY-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase()}`;
    }
}
exports.PaymentCreationService = PaymentCreationService;
exports.paymentCreationService = new PaymentCreationService();
