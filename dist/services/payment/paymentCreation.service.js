"use strict";
// backend/src/services/payment/paymentCreation.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentCreationService = exports.PaymentCreationService = void 0;
const crypto_1 = require("crypto");
const payment_repository_1 = require("../../repositories/payment.repository");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const payment_service_1 = require("../financial/payment.service");
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
        return payment_service_1.paymentService.createPayment({
            bookingId: input.bookingId.toString(),
            userId: input.userId.toString(),
            creatorId: input.creatorId.toString(),
            serviceAmount: { amount: input.serviceAmount, currency: input.currency },
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            method: input.method ?? paymentMethod_enum_1.PaymentMethod.INTERNAL,
            idempotencyKey,
        });
    }
}
exports.PaymentCreationService = PaymentCreationService;
exports.paymentCreationService = new PaymentCreationService();
