import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { ProviderRoutingCapabilityProfile } from "./providerRouting.types";
import {
  InitializePayoutRequest,
  InitializePayoutResponse,
} from "./payoutProvider.types";

export interface PayoutProviderInterface {
  readonly provider: PaymentProvider;
  readonly routingCapabilityProfile?: ProviderRoutingCapabilityProfile;

  initializePayout(
    request: InitializePayoutRequest,
  ): Promise<InitializePayoutResponse>;

  getPayoutResult(
    request: import("./payoutProvider.types").GetPayoutResultRequest,
  ): Promise<import("./payoutProvider.types").PayoutProviderResult>;
}
