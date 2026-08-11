import { FINANCIAL_LIMITS } from
  "../../constants/financial/financialLimits";
import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";

export const CUSTOMER_PLATFORM_FEE_RATE_BPS = 500;
export const CREATOR_COMMISSION_RATE_BPS = 2_000;
const BPS_DENOMINATOR = 10_000;
const ROUNDING_OFFSET = BPS_DENOMINATOR / 2;

export interface MarketplacePricingSnapshot {
  serviceAmount: number;
  platformFeeAmount: number;
  commissionAmount: number;
  creatorAmount: number;
  totalAmount: number;
  currency: SupportedCurrency;
}

const calculateBps = (amount: number, rateBps: number) => {
  const scaled = amount * rateBps;
  if (!Number.isSafeInteger(scaled) ||
    !Number.isSafeInteger(scaled + ROUNDING_OFFSET)) {
    throw new Error("Marketplace pricing exceeds safe integer limits.");
  }
  return Math.floor((scaled + ROUNDING_OFFSET) / BPS_DENOMINATOR);
};

export class MarketplacePricingService {
  calculate(input: {
    serviceAmount: number;
    currency: SupportedCurrency;
  }): MarketplacePricingSnapshot {
    if (!Number.isSafeInteger(input.serviceAmount) ||
      input.serviceAmount < FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT) {
      throw new Error("Service amount must be a positive safe integer.");
    }
    const platformFeeAmount = calculateBps(
      input.serviceAmount,
      CUSTOMER_PLATFORM_FEE_RATE_BPS,
    );
    const commissionAmount = calculateBps(
      input.serviceAmount,
      CREATOR_COMMISSION_RATE_BPS,
    );
    const creatorAmount = input.serviceAmount - commissionAmount;
    const totalAmount = input.serviceAmount + platformFeeAmount;
    if (![platformFeeAmount, commissionAmount, creatorAmount, totalAmount]
      .every(Number.isSafeInteger) || creatorAmount < 1 ||
      totalAmount > FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT ||
      creatorAmount + commissionAmount !== input.serviceAmount ||
      input.serviceAmount + platformFeeAmount !== totalAmount) {
      throw new Error("Marketplace pricing snapshot does not reconcile.");
    }
    return { serviceAmount: input.serviceAmount, platformFeeAmount,
      commissionAmount, creatorAmount, totalAmount, currency: input.currency };
  }

  validate(snapshot: MarketplacePricingSnapshot): void {
    const expected = this.calculate({ serviceAmount: snapshot.serviceAmount,
      currency: snapshot.currency });
    for (const field of ["platformFeeAmount", "commissionAmount",
      "creatorAmount", "totalAmount"] as const) {
      if (snapshot[field] !== expected[field]) {
        throw new Error("Marketplace pricing snapshot conflicts.");
      }
    }
  }
}

export const marketplacePricingService = new MarketplacePricingService();
