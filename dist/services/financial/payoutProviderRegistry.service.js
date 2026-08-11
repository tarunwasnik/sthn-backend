"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutProviderRegistry = exports.PayoutProviderRegistry = void 0;
const internalPayout_provider_1 = require("./providers/internalPayout.provider");
class PayoutProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.register(internalPayout_provider_1.internalPayoutProvider);
    }
    register(provider) {
        this.providers.set(provider.provider, provider);
    }
    get(provider) {
        const implementation = this.providers.get(provider);
        if (!implementation) {
            throw new Error(`Payout provider '${provider}' has not been registered.`);
        }
        return implementation;
    }
}
exports.PayoutProviderRegistry = PayoutProviderRegistry;
exports.payoutProviderRegistry = new PayoutProviderRegistry();
