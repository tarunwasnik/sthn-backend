"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_COMMISSION_RATE_BPS = void 0;
exports.calculateSettlement = calculateSettlement;
const paymentPricingPolicy_enum_1 = require("../../enums/financial/paymentPricingPolicy.enum");
const SettlementError_1 = require("../../errors/financial/SettlementError");
const marketplacePricing_service_1 = require("./marketplacePricing.service");
exports.PLATFORM_COMMISSION_RATE_BPS = marketplacePricing_service_1.CREATOR_COMMISSION_RATE_BPS;
function calculateSettlement(input) {
    const values = [input.serviceAmount, input.customerFeeAmount, input.grossEscrowAmount, input.paymentAmount];
    if (values.some((v) => !Number.isSafeInteger(v) || v < 0) || input.grossEscrowAmount !== input.serviceAmount + input.customerFeeAmount || input.paymentAmount !== input.grossEscrowAmount)
        throw new SettlementError_1.SettlementError("Payment pricing snapshot is inconsistent.", "INVALID_SETTLEMENT_AMOUNT");
    let pricing;
    try {
        pricing = marketplacePricing_service_1.marketplacePricingService.calculate({
            serviceAmount: input.serviceAmount,
            currency: input.currency,
        });
        if (input.pricingPolicy === paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1 &&
            (input.customerFeeAmount !== pricing.platformFeeAmount ||
                input.grossEscrowAmount !== pricing.totalAmount)) {
            throw new Error("Standard customer fee conflicts.");
        }
    }
    catch (error) {
        throw new SettlementError_1.SettlementError("Settlement amount is unsafe.", "INVALID_SETTLEMENT_AMOUNT", { cause: error });
    }
    const platformCommissionAmount = pricing.commissionAmount;
    const creatorNetAmount = pricing.creatorAmount;
    const platformRevenueAmount = input.customerFeeAmount + platformCommissionAmount;
    if (creatorNetAmount < 0 || platformRevenueAmount < 0 || creatorNetAmount + platformRevenueAmount !== input.grossEscrowAmount)
        throw new SettlementError_1.SettlementError("Settlement amounts do not reconcile.", "INVALID_SETTLEMENT_AMOUNT");
    return { serviceAmount: input.serviceAmount, customerFeeAmount: input.customerFeeAmount, grossEscrowAmount: input.grossEscrowAmount, platformCommissionRateBps: exports.PLATFORM_COMMISSION_RATE_BPS, platformCommissionAmount, creatorNetAmount, platformRevenueAmount, currency: input.currency, calculationVersion: 1 };
}
