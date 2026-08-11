import { PayoutProviderInterface } from "../../contracts/financial/payoutProvider.interface";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { internalPayoutProvider } from "./providers/internalPayout.provider";

export class PayoutProviderRegistry {
  private readonly providers = new Map<PaymentProvider, PayoutProviderInterface>();

  constructor() {
    this.register(internalPayoutProvider);
  }

  register(provider: PayoutProviderInterface): void {
    this.providers.set(provider.provider, provider);
  }

  get(provider: PaymentProvider): PayoutProviderInterface {
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new Error(`Payout provider '${provider}' has not been registered.`);
    }

    return implementation;
  }
}

export const payoutProviderRegistry = new PayoutProviderRegistry();
