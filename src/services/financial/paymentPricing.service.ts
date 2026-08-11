import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { PaymentError } from "../../errors/financial/PaymentError";
import { PaymentPricingPolicy } from "../../enums/financial/paymentPricingPolicy.enum";
import { CUSTOMER_PLATFORM_FEE_RATE_BPS, marketplacePricingService } from
  "./marketplacePricing.service";

export interface PaymentPricingSnapshot {
  serviceAmount: number;
  customerFeeRateBps: number;
  customerFeeAmount: number;
  grossEscrowAmount: number;
  currency: SupportedCurrency;
  pricingPolicy: PaymentPricingPolicy;
  pricingVersion: number;
}

const BPS_DENOMINATOR = 10_000;

export class PaymentPricingService {
  calculateStandardPricing(input: {
    serviceAmount: number;
    currency: SupportedCurrency;
  }): PaymentPricingSnapshot {
    const { serviceAmount, currency } = input;
    if (!Number.isSafeInteger(serviceAmount) || serviceAmount < FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT) {
      throw new PaymentError("Service amount must be a positive safe integer.", "INVALID_PRICING_SNAPSHOT");
    }

    let calculated;
    try {
      calculated = marketplacePricingService.calculate({ serviceAmount,
        currency });
    } catch {
      throw new PaymentError("Gross payment amount cannot be priced safely.", "UNSAFE_MONETARY_VALUE");
    }

    return {
      serviceAmount,
      customerFeeRateBps: CUSTOMER_PLATFORM_FEE_RATE_BPS,
      customerFeeAmount: calculated.platformFeeAmount,
      grossEscrowAmount: calculated.totalAmount,
      currency,
      pricingPolicy: PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1,
      pricingVersion: 1,
    };
  }

  validateSnapshot(snapshot: PaymentPricingSnapshot): void {
    const values = [snapshot.serviceAmount, snapshot.customerFeeAmount, snapshot.grossEscrowAmount];
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new PaymentError("Pricing snapshot contains an unsafe monetary value.", "INVALID_PRICING_SNAPSHOT");
    }
    if (!Number.isSafeInteger(snapshot.customerFeeRateBps) || snapshot.customerFeeRateBps < 0 || snapshot.customerFeeRateBps > BPS_DENOMINATOR) {
      throw new PaymentError("Pricing snapshot has invalid basis points.", "INVALID_PRICING_SNAPSHOT");
    }
    if (snapshot.grossEscrowAmount !== snapshot.serviceAmount + snapshot.customerFeeAmount) {
      throw new PaymentError("Pricing snapshot totals are inconsistent.", "INVALID_PRICING_SNAPSHOT");
    }
    if (snapshot.pricingPolicy === PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1) {
      const expected = this.calculateStandardPricing({ serviceAmount: snapshot.serviceAmount, currency: snapshot.currency });
      if (snapshot.customerFeeRateBps !== expected.customerFeeRateBps || snapshot.customerFeeAmount !== expected.customerFeeAmount || snapshot.grossEscrowAmount !== expected.grossEscrowAmount || snapshot.pricingVersion !== expected.pricingVersion) {
        throw new PaymentError("Standard pricing snapshot is inconsistent.", "INVALID_PRICING_SNAPSHOT");
      }
    }
    if (snapshot.pricingPolicy === PaymentPricingPolicy.LEGACY_NO_CUSTOMER_FEE && (snapshot.customerFeeRateBps !== 0 || snapshot.customerFeeAmount !== 0 || snapshot.grossEscrowAmount !== snapshot.serviceAmount || snapshot.pricingVersion !== 0)) {
      throw new PaymentError("Legacy pricing snapshot is inconsistent.", "INVALID_PRICING_SNAPSHOT");
    }
  }
}

export const paymentPricingService = new PaymentPricingService();
