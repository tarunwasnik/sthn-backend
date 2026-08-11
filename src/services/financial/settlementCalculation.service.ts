import { PaymentPricingPolicy } from "../../enums/financial/paymentPricingPolicy.enum";
import { SettlementError } from "../../errors/financial/SettlementError";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import {
  CREATOR_COMMISSION_RATE_BPS,
  marketplacePricingService,
} from "./marketplacePricing.service";

export const PLATFORM_COMMISSION_RATE_BPS = CREATOR_COMMISSION_RATE_BPS;

export interface SettlementCalculation { serviceAmount: number; customerFeeAmount: number; grossEscrowAmount: number; platformCommissionRateBps: number; platformCommissionAmount: number; creatorNetAmount: number; platformRevenueAmount: number; currency: string; calculationVersion: number; }

export function calculateSettlement(input: { serviceAmount: number; customerFeeAmount: number; grossEscrowAmount: number; currency: string; pricingPolicy: PaymentPricingPolicy; pricingVersion: number; paymentAmount: number; }): SettlementCalculation {
  const values = [input.serviceAmount, input.customerFeeAmount, input.grossEscrowAmount, input.paymentAmount];
  if (values.some((v) => !Number.isSafeInteger(v) || v < 0) || input.grossEscrowAmount !== input.serviceAmount + input.customerFeeAmount || input.paymentAmount !== input.grossEscrowAmount) throw new SettlementError("Payment pricing snapshot is inconsistent.", "INVALID_SETTLEMENT_AMOUNT");
  let pricing;
  try {
    pricing = marketplacePricingService.calculate({
      serviceAmount: input.serviceAmount,
      currency: input.currency as SupportedCurrency,
    });
    if (input.pricingPolicy === PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1 &&
      (input.customerFeeAmount !== pricing.platformFeeAmount ||
        input.grossEscrowAmount !== pricing.totalAmount)) {
      throw new Error("Standard customer fee conflicts.");
    }
  } catch (error) {
    throw new SettlementError("Settlement amount is unsafe.", "INVALID_SETTLEMENT_AMOUNT", { cause: error });
  }
  const platformCommissionAmount = pricing.commissionAmount;
  const creatorNetAmount = pricing.creatorAmount;
  const platformRevenueAmount = input.customerFeeAmount + platformCommissionAmount;
  if (creatorNetAmount < 0 || platformRevenueAmount < 0 || creatorNetAmount + platformRevenueAmount !== input.grossEscrowAmount) throw new SettlementError("Settlement amounts do not reconcile.", "INVALID_SETTLEMENT_AMOUNT");
  return { serviceAmount: input.serviceAmount, customerFeeAmount: input.customerFeeAmount, grossEscrowAmount: input.grossEscrowAmount, platformCommissionRateBps: PLATFORM_COMMISSION_RATE_BPS, platformCommissionAmount, creatorNetAmount, platformRevenueAmount, currency: input.currency, calculationVersion: 1 };
}
