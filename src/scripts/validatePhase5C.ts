import assert from "node:assert/strict";
import { calculateSettlement } from "../services/financial/settlementCalculation.service";
import { PaymentPricingPolicy } from "../enums/financial/paymentPricingPolicy.enum";
const result = calculateSettlement({ serviceAmount: 100_000, customerFeeAmount: 5_000, grossEscrowAmount: 105_000, paymentAmount: 105_000, currency: "INR", pricingPolicy: PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1, pricingVersion: 1 });
assert.equal(result.platformCommissionAmount, 20_000); assert.equal(result.creatorNetAmount, 80_000); assert.equal(result.platformRevenueAmount, 25_000); assert.equal(result.creatorNetAmount + result.platformRevenueAmount, result.grossEscrowAmount);
assert.throws(() => calculateSettlement({ ...result, paymentAmount: 100_000, pricingPolicy: PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1, pricingVersion: 1 }));
console.log("Phase 5C focused assertions passed.");
