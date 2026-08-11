"use strict";
// backend/src/services/financial/paymentProviderRegistry.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentProviderRegistry = exports.PaymentProviderRegistry = void 0;
const internal_provider_1 = require("./providers/internal.provider");
class PaymentProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.register(internal_provider_1.internalPaymentProvider);
        /**
         * Future providers
         *
         * this.register(razorpayProvider);
         * this.register(stripeProvider);
         * this.register(cashfreeProvider);
         * this.register(paypalProvider);
         */
    }
    register(provider) {
        this.providers.set(provider.provider, provider);
    }
    unregister(provider) {
        this.providers.delete(provider);
    }
    has(provider) {
        return this.providers.has(provider);
    }
    get(provider) {
        const implementation = this.providers.get(provider);
        if (!implementation) {
            throw new Error(`Payment provider '${provider}' has not been registered.`);
        }
        return implementation;
    }
    list() {
        return [...this.providers.keys()];
    }
}
exports.PaymentProviderRegistry = PaymentProviderRegistry;
exports.paymentProviderRegistry = new PaymentProviderRegistry();
