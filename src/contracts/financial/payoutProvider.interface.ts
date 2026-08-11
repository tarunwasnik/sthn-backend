import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import {
  InitializePayoutRequest,
  InitializePayoutResponse,
} from "./payoutProvider.types";

export interface PayoutProviderInterface {
  readonly provider: PaymentProvider;

  initializePayout(
    request: InitializePayoutRequest,
  ): Promise<InitializePayoutResponse>;

  getPayoutResult(
    request: import("./payoutProvider.types").GetPayoutResultRequest,
  ): Promise<import("./payoutProvider.types").PayoutProviderResult>;
}
