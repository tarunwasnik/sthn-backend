"use strict";
// backend/src/services/financial/payment.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = exports.PaymentService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payment_repository_1 = require("../../repositories/payment.repository");
const money_util_1 = require("../../utils/financial/money.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
const paymentPricing_service_1 = require("./paymentPricing.service");
class PaymentService {
    constructor(repository = payment_repository_1.paymentRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    validateObjectId(value, field) {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new PaymentError_1.PaymentError(`Invalid ${field}.`);
        }
    }
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new PaymentError_1.PaymentError("Invalid payment amount.");
        }
    }
    async getPaymentDocument(paymentId) {
        this.validateObjectId(paymentId, "payment id");
        const payment = await this.repository.findById(new mongoose_1.default.Types.ObjectId(paymentId));
        if (!payment) {
            throw new PaymentError_1.PaymentError("Payment not found.");
        }
        return payment;
    }
    async save(_payment, _update) {
        throw new PaymentError_1.PaymentError("Legacy generic Payment mutation is disabled; use PaymentLifecycleService.", "PAYMENT_INVALID_TRANSITION");
    }
    /* -------------------------------------------------------------------------- */
    /* Creation                                                                    */
    /* -------------------------------------------------------------------------- */
    async createPayment(input) {
        this.validateObjectId(input.bookingId, "booking id");
        this.validateObjectId(input.userId, "user id");
        this.validateObjectId(input.creatorId, "creator id");
        this.validateMoney(input.serviceAmount);
        const pricing = input.pricingSnapshot ?? paymentPricing_service_1.paymentPricingService.calculateStandardPricing({
            serviceAmount: input.serviceAmount.amount,
            currency: input.serviceAmount.currency,
        });
        paymentPricing_service_1.paymentPricingService.validateSnapshot(pricing);
        if (pricing.currency !== input.serviceAmount.currency) {
            throw new PaymentError_1.PaymentError("Payment pricing currency is inconsistent.", "INVALID_PRICING_SNAPSHOT");
        }
        if (input.idempotencyKey) {
            const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey);
            if (existing) {
                return existing;
            }
        }
        return this.repository.create({
            paymentReference: (0, reference_util_1.generateFinancialReference)("PAYMENT"),
            bookingId: new mongoose_1.default.Types.ObjectId(input.bookingId),
            userId: new mongoose_1.default.Types.ObjectId(input.userId),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            // `amount` is the one canonical provider/capture amount for new payments.
            amount: pricing.grossEscrowAmount,
            currency: pricing.currency,
            serviceAmount: pricing.serviceAmount,
            customerFeeRateBps: pricing.customerFeeRateBps,
            customerFeeAmount: pricing.customerFeeAmount,
            grossEscrowAmount: pricing.grossEscrowAmount,
            pricingPolicy: pricing.pricingPolicy,
            pricingVersion: pricing.pricingVersion,
            pricingCalculatedAt: new Date(),
            provider: input.provider ?? paymentProvider_enum_1.PaymentProvider.INTERNAL,
            method: input.method ?? paymentMethod_enum_1.PaymentMethod.INTERNAL,
            status: paymentStatus_enum_1.PaymentStatus.CREATED,
            providerPaymentId: input.providerPaymentId,
            providerOrderId: input.providerOrderId,
            providerTransactionId: input.providerTransactionId,
            authorizationId: input.authorizationId,
            settlementId: input.settlementId,
            attemptNumber: 1,
            retryable: true,
            failureReason: paymentFailureReason_enum_1.PaymentFailureReason.NONE,
            idempotencyKey: input.idempotencyKey ?? (0, idempotency_util_1.generateIdempotencyKey)(),
            providerPayload: input.providerPayload ?? {},
            attributes: input.attributes ?? {},
        }, input.session);
    }
    /* -------------------------------------------------------------------------- */
    /* Reads                                                                       */
    /* -------------------------------------------------------------------------- */
    async getPayment(paymentId) {
        return this.getPaymentDocument(paymentId);
    }
    async getByReference(paymentReference) {
        const payment = await this.repository.findByPaymentReference(paymentReference);
        if (!payment) {
            throw new PaymentError_1.PaymentError("Payment not found.");
        }
        return payment;
    }
    async getByBooking(bookingId) {
        this.validateObjectId(bookingId, "booking id");
        return this.repository.findByBookingId(new mongoose_1.default.Types.ObjectId(bookingId));
    }
    async getByUser(userId) {
        this.validateObjectId(userId, "user id");
        return this.repository.findByUserId(new mongoose_1.default.Types.ObjectId(userId));
    }
    async getByCreator(creatorId) {
        this.validateObjectId(creatorId, "creator id");
        return this.repository.findByCreatorId(new mongoose_1.default.Types.ObjectId(creatorId));
    }
    /* -------------------------------------------------------------------------- */
    /* Status                                                                      */
    /* -------------------------------------------------------------------------- */
    async updateStatus(paymentId, status) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status,
        });
    }
    /**
     * Marks a payment as initializing.
     *
     * This state indicates that payment processing has started
     * and the provider is being contacted.
     */
    async markInitializing(paymentId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.INITIALIZING,
        });
    }
    /**
     * Marks a payment as pending.
     *
     * This state indicates that the payment request has been
     * accepted by the provider and is awaiting authorization
     * or further processing.
     */
    async markPending(paymentId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.PENDING,
        });
    }
    async markAuthorized(paymentId, authorizationId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
            authorizationId,
        });
    }
    async markCaptured(paymentId, providerTransactionId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.CAPTURED,
            providerTransactionId,
        });
    }
    async markSettled(paymentId, settlementId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.SETTLED,
            settlementId,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Failure                                                                     */
    /* -------------------------------------------------------------------------- */
    async markFailed(paymentId, reason, message) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.FAILED,
            failureReason: reason,
            failureMessage: message,
            attemptNumber: payment.attemptNumber + 1,
        });
    }
    async markCancelled(paymentId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.CANCELLED,
        });
    }
    async markRefunded(paymentId) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            status: paymentStatus_enum_1.PaymentStatus.REFUNDED,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Provider                                                                    */
    /* -------------------------------------------------------------------------- */
    async updateProviderReferences(paymentId, data) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            ...data,
        });
    }
    async updateProviderPayload(paymentId, payload) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            providerPayload: payload,
        });
    }
    async updateAttributes(paymentId, attributes) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            attributes,
        });
    }
    async setRetryable(paymentId, retryable) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, {
            retryable,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    async exists(paymentId) {
        this.validateObjectId(paymentId, "payment id");
        return this.repository.exists({
            _id: new mongoose_1.default.Types.ObjectId(paymentId),
        });
    }
    async existsByReference(paymentReference) {
        return this.repository.exists({
            paymentReference,
        });
    }
    async findByIdempotencyKey(idempotencyKey) {
        return this.repository.findByIdempotencyKey(idempotencyKey);
    }
    async verifyIntegrity(paymentId) {
        const payment = await this.getPaymentDocument(paymentId);
        return (payment.amount > 0 &&
            payment.paymentReference.length > 0 &&
            payment.currency.length > 0 &&
            payment.idempotencyKey.length > 0);
    }
    /* -------------------------------------------------------------------------- */
    /* Generic Repository Helpers                                                  */
    /* -------------------------------------------------------------------------- */
    async findOne(filter) {
        return this.repository.findOne(filter);
    }
    async findMany(filter) {
        return this.repository.findMany(filter);
    }
    async update(paymentId, update) {
        const payment = await this.getPaymentDocument(paymentId);
        return this.save(payment, update);
    }
    async deletePayment(paymentId) {
        await this.getPaymentDocument(paymentId);
        throw new PaymentError_1.PaymentError("Financial Payments cannot be deleted through the application.", "PAYMENT_DELETION_NOT_ALLOWED");
    }
}
exports.PaymentService = PaymentService;
exports.paymentService = new PaymentService();
