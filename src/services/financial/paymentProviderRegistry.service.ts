// backend/src/services/financial/paymentProviderRegistry.service.ts

import { PaymentProviderInterface } from "../../contracts/financial/paymentProvider.interface";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

import { internalPaymentProvider } from "./providers/internal.provider";

export class PaymentProviderRegistry {
  private readonly providers = new Map<
    PaymentProvider,
    PaymentProviderInterface
  >();

  constructor() {
    this.register(internalPaymentProvider);

    /**
     * Future providers
     *
     * this.register(razorpayProvider);
     * this.register(stripeProvider);
     * this.register(cashfreeProvider);
     * this.register(paypalProvider);
     */
  }

  register(provider: PaymentProviderInterface): void {
    this.providers.set(provider.provider, provider);
  }

  unregister(provider: PaymentProvider): void {
    this.providers.delete(provider);
  }

  has(provider: PaymentProvider): boolean {
    return this.providers.has(provider);
  }

  get(provider: PaymentProvider): PaymentProviderInterface {
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new Error(
        `Payment provider '${provider}' has not been registered.`,
      );
    }

    return implementation;
  }

  list(): PaymentProvider[] {
    return [...this.providers.keys()];
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
