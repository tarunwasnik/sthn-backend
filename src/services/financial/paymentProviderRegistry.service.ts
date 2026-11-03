// backend/src/services/financial/paymentProviderRegistry.service.ts

import { PaymentProviderInterface } from "../../contracts/financial/paymentProvider.interface";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

import { internalPaymentProvider } from "./providers/internal.provider";
import { assertFinancialSimulatorAllowed } from "./simulatorAccess.service";
import { SUPPORTED_CURRENCIES } from "../../constants/financial/supportedCurrencies";
import { PaymentError } from "../../errors/financial/PaymentError";
import { RazorpaySandboxPaymentProvider, razorpaySandboxConfigurationFromEnvironment, razorpaySandboxFetchClient } from "./providers/razorpaySandbox.provider";

export interface PaymentProviderSelection {
  provider: PaymentProvider;
  currency: string;
  operation: "PAYMENT" | "REFUND";
  requiredCapabilities: readonly string[];
}

export class PaymentProviderRegistry {
  private readonly providers = new Map<
    PaymentProvider,
    PaymentProviderInterface
  >();

  constructor() {
    this.register(internalPaymentProvider);
    const razorpay = razorpaySandboxConfigurationFromEnvironment();
    if (razorpay) {
      this.register(new RazorpaySandboxPaymentProvider(razorpay, razorpaySandboxFetchClient));
    }

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
    if (provider === PaymentProvider.INTERNAL) assertFinancialSimulatorAllowed();
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
  routingProfile(provider: PaymentProvider) { return this.providers.get(provider)?.routingCapabilityProfile; }

  select(request: PaymentProviderSelection): PaymentProviderInterface {
    // This is the only configured payment adapter. Future real adapters must
    // add verified capabilities and corridor-evidence validation here; mere
    // registration or implementation of the interface is not eligibility.
    const implementation = this.providers.get(request.provider);
    const capabilities = ["session", "verify", "status"];
    const internal = request.provider === PaymentProvider.INTERNAL && implementation === internalPaymentProvider;
    const razorpaySandbox = request.provider === PaymentProvider.RAZORPAY &&
      implementation instanceof RazorpaySandboxPaymentProvider &&
      ["test", "development"].includes(process.env.NODE_ENV ?? "");
    if ((!internal && !razorpaySandbox) || (razorpaySandbox && request.currency !== "INR") || request.operation !== "PAYMENT" ||
        !SUPPORTED_CURRENCIES.some((currency) => currency === request.currency) ||
        !request.requiredCapabilities.every((capability) => capabilities.includes(capability))) {
      throw new PaymentError("Payment provider or required operation, currency, or capability is unavailable.", "PAYMENT_PROVIDER_UNAVAILABLE");
    }
    return this.get(request.provider);
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
