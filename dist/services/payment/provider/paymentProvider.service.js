"use strict";
// backend/src/services/payment/provider/paymentProvider.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentProviderService = exports.PaymentProviderService = void 0;
const PaymentError_1 = require("../../../errors/financial/PaymentError");
const internal_provider_1 = require("../../financial/providers/internal.provider");
class PaymentProviderService {
    constructor() {
        this.providers = new Map();
        this.register(internal_provider_1.internalPaymentProvider);
    }
    register(provider) {
        this.providers.set(provider.provider, provider);
    }
    resolveProvider(provider) {
        const implementation = this.providers.get(provider);
        if (!implementation) {
            throw new PaymentError_1.PaymentError(`Unsupported payment provider "${provider}".`);
        }
        return implementation;
    }
    /* -------------------------------------------------------------------------- */
    /* Provider Lifecycle API                                                     */
    /* -------------------------------------------------------------------------- */
    async createPaymentSession(request) {
        return this.resolveProvider(request.provider).createPaymentSession(request);
    }
    async verifyPayment(provider, request) {
        return this.resolveProvider(provider).verifyPayment(request);
    }
    async getPaymentStatus(provider, request) {
        return this.resolveProvider(provider).getPaymentStatus(request);
    }
    async createRefund(provider, request) {
        return this.resolveProvider(provider).createRefund(request);
    }
    async verifyWebhook(provider, request) {
        return this.resolveProvider(provider).verifyWebhook(request);
    }
    /**
     * --------------------------------------------------------------------------
     * High-Level Processing API
     * --------------------------------------------------------------------------
     *
     * Executes the complete provider-side payment lifecycle.
     *
     * PaymentProcessingService depends on this orchestration.
     */
    async process(payment) {
        const session = await this.createPaymentSession({
            paymentId: payment._id.toString(),
            paymentReference: payment.paymentReference,
            bookingId: payment.bookingId.toString(),
            userId: payment.userId.toString(),
            creatorId: payment.creatorId.toString(),
            amount: {
                amount: payment.amount,
                currency: payment.currency,
            },
            provider: payment.provider,
            method: payment.method,
            idempotencyKey: payment.paymentReference,
        });
        const verification = await this.verifyPayment(payment.provider, {
            providerPaymentId: session.providerPaymentId,
            providerOrderId: session.providerOrderId,
        });
        const status = await this.getPaymentStatus(payment.provider, {
            providerPaymentId: session.providerPaymentId,
        });
        return {
            success: verification.verified,
            status: status.providerStatus,
            authorizationId: verification.providerTransactionId,
            providerPaymentId: session.providerPaymentId,
            providerOrderId: session.providerOrderId,
            providerTransactionId: status.providerTransactionId,
            providerPayload: status.payload,
            message: verification.verified
                ? "Payment processed successfully."
                : "Provider verification failed.",
        };
    }
}
exports.PaymentProviderService = PaymentProviderService;
exports.paymentProviderService = new PaymentProviderService();
