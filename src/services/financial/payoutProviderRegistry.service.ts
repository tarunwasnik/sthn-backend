import { PayoutProviderInterface } from "../../contracts/financial/payoutProvider.interface";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { internalPayoutProvider } from "./providers/internalPayout.provider";
import { assertFinancialSimulatorAllowed } from "./simulatorAccess.service";

export class PayoutProviderRegistry {
  private readonly providers = new Map<PaymentProvider, PayoutProviderInterface>();

  constructor() {
    this.register(internalPayoutProvider);
  }

  register(provider: PayoutProviderInterface): void {
    this.providers.set(provider.provider, provider);
  }

  get(provider: PaymentProvider): PayoutProviderInterface {
    if (provider === PaymentProvider.INTERNAL) assertFinancialSimulatorAllowed();
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new Error(`Payout provider '${provider}' has not been registered.`);
    }

    return implementation;
  }
  has(provider: PaymentProvider): boolean { return this.providers.has(provider); }
  list(): PaymentProvider[] { return [...this.providers.keys()]; }
  routingProfile(provider: PaymentProvider) { return this.providers.get(provider)?.routingCapabilityProfile; }
}

export const payoutProviderRegistry = new PayoutProviderRegistry();
