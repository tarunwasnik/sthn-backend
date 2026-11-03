import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";
import { authoritativeRefundDecisionReader } from "./authoritativeRefundDecisionReader.service";
import { RefundAuthorizationService } from "./refundAuthorization.service";

const capabilities = (provider: PaymentProvider) => {
  try { return paymentProviderRegistry.get(provider).dispositionRefundCapabilities ?? null; }
  catch { return null; }
};

/** Canonical admission boundary for final dispute/appeal Customer refunds. */
export const authoritativeRefundAuthorizationService = new RefundAuthorizationService(authoritativeRefundDecisionReader, { capabilities });
