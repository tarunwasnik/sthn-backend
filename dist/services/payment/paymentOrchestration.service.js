"use strict";
//backend/src/services/payment/paymentOrchestration.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentOrchestrationService = exports.PaymentOrchestrationService = void 0;
const paymentCreation_service_1 = require("./paymentCreation.service");
const paymentValidation_service_1 = require("./paymentValidation.service");
const paymentProcessing_service_1 = require("./paymentProcessing.service");
const payment_service_1 = require("../financial/payment.service");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
class PaymentOrchestrationService {
    constructor(validator = paymentValidation_service_1.paymentValidationService, creator = paymentCreation_service_1.paymentCreationService, processor = paymentProcessing_service_1.paymentProcessingService, payments = payment_service_1.paymentService) {
        this.validator = validator;
        this.creator = creator;
        this.processor = processor;
        this.payments = payments;
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                    */
    /* -------------------------------------------------------------------------- */
    /**
     * Loads a payment.
     */
    async getPayment(paymentId) {
        return this.payments.getPayment(paymentId.toString());
    }
    /**
     * Ensures an existing payment can be processed.
     */
    ensureProcessable(payment) {
        this.validator.validateProcessable(payment);
    }
    /* -------------------------------------------------------------------------- */
    /* Payment Execution                                                          */
    /* -------------------------------------------------------------------------- */
    /**
     * Executes the complete payment workflow.
     *
     * Flow
     * ----
     * Create Payment
     *      ↓
     * Validate Payment
     *      ↓
     * Process Payment
     *      ↓
     * Return Final Result
     */
    async executePayment(request) {
        const payment = await this.creator.createPayment(request);
        this.validator.validate(payment);
        const processing = await this.processor.processPayment(payment._id.toString());
        return {
            success: processing.success,
            payment: processing.payment,
            processing,
            message: processing.message,
        };
    }
    /**
     * Processes an existing payment.
     *
     * This is used when a payment has already been created
     * and only the processing lifecycle should be executed.
     */
    async processExistingPayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        this.ensureProcessable(payment);
        return this.processor.processPayment(payment._id.toString());
    }
    /**
     * Returns the current processing state
     * of a payment.
     */
    async getPaymentStatus(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status;
    }
    /**
     * Determines whether a payment
     * is eligible for processing.
     */
    async canProcessPayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status === paymentStatus_enum_1.PaymentStatus.CREATED;
    }
    /**
     * Cancels an existing payment.
     */
    async cancelPayment(paymentId) {
        return this.processor.cancelPayment(paymentId.toString());
    }
    /**
     * Retries a failed payment.
     */
    async retryPayment(paymentId) {
        return this.processor.retryPayment(paymentId.toString());
    }
    /**
     * Determines whether a payment
     * may be retried.
     */
    async canRetryPayment(paymentId) {
        return this.processor.canRetry(paymentId.toString());
    }
    /**
     * Permanently disables retries
     * for a payment.
     */
    async disableRetries(paymentId) {
        return this.processor.disableRetries(paymentId.toString());
    }
    /* -------------------------------------------------------------------------- */
    /* Read Helpers                                                               */
    /* -------------------------------------------------------------------------- */
    /**
     * Returns a payment by its identifier.
     */
    async getPaymentById(paymentId) {
        return this.getPayment(paymentId);
    }
    /**
     * Determines whether a payment has
     * completed successfully.
     */
    async isPaymentCompleted(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status === paymentStatus_enum_1.PaymentStatus.SETTLED;
    }
    /**
     * Determines whether a payment
     * has failed.
     */
    async isPaymentFailed(paymentId) {
        const payment = await this.getPayment(paymentId);
        return payment.status === paymentStatus_enum_1.PaymentStatus.FAILED;
    }
    /**
     * Determines whether a payment
     * is still active.
     */
    async isPaymentInProgress(paymentId) {
        const payment = await this.getPayment(paymentId);
        switch (payment.status) {
            case paymentStatus_enum_1.PaymentStatus.CREATED:
            case paymentStatus_enum_1.PaymentStatus.INITIALIZING:
            case paymentStatus_enum_1.PaymentStatus.PENDING:
            case paymentStatus_enum_1.PaymentStatus.AUTHORIZED:
            case paymentStatus_enum_1.PaymentStatus.CAPTURED:
                return true;
            default:
                return false;
        }
    }
}
exports.PaymentOrchestrationService = PaymentOrchestrationService;
exports.paymentOrchestrationService = new PaymentOrchestrationService();
