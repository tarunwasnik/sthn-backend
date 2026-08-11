"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentPricingService = exports.PaymentPricingService = void 0;
const financialLimits_1 = require("../../constants/financial/financialLimits");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const paymentPricingPolicy_enum_1 = require("../../enums/financial/paymentPricingPolicy.enum");
const marketplacePricing_service_1 = require("./marketplacePricing.service");
const BPS_DENOMINATOR = 10000;
class PaymentPricingService {
    calculateStandardPricing(input) {
        const { serviceAmount, currency } = input;
        if (!Number.isSafeInteger(serviceAmount) || serviceAmount < financialLimits_1.FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT) {
            throw new PaymentError_1.PaymentError("Service amount must be a positive safe integer.", "INVALID_PRICING_SNAPSHOT");
        }
        let calculated;
        try {
            calculated = marketplacePricing_service_1.marketplacePricingService.calculate({ serviceAmount,
                currency });
        }
        catch {
            throw new PaymentError_1.PaymentError("Gross payment amount cannot be priced safely.", "UNSAFE_MONETARY_VALUE");
        }
        return {
            serviceAmount,
            customerFeeRateBps: marketplacePricing_service_1.CUSTOMER_PLATFORM_FEE_RATE_BPS,
            customerFeeAmount: calculated.platformFeeAmount,
            grossEscrowAmount: calculated.totalAmount,
            currency,
            pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1,
            pricingVersion: 1,
        };
    }
    validateSnapshot(snapshot) {
        const values = [snapshot.serviceAmount, snapshot.customerFeeAmount, snapshot.grossEscrowAmount];
        if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
            throw new PaymentError_1.PaymentError("Pricing snapshot contains an unsafe monetary value.", "INVALID_PRICING_SNAPSHOT");
        }
        if (!Number.isSafeInteger(snapshot.customerFeeRateBps) || snapshot.customerFeeRateBps < 0 || snapshot.customerFeeRateBps > BPS_DENOMINATOR) {
            throw new PaymentError_1.PaymentError("Pricing snapshot has invalid basis points.", "INVALID_PRICING_SNAPSHOT");
        }
        if (snapshot.grossEscrowAmount !== snapshot.serviceAmount + snapshot.customerFeeAmount) {
            throw new PaymentError_1.PaymentError("Pricing snapshot totals are inconsistent.", "INVALID_PRICING_SNAPSHOT");
        }
        if (snapshot.pricingPolicy === paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1) {
            const expected = this.calculateStandardPricing({ serviceAmount: snapshot.serviceAmount, currency: snapshot.currency });
            if (snapshot.customerFeeRateBps !== expected.customerFeeRateBps || snapshot.customerFeeAmount !== expected.customerFeeAmount || snapshot.grossEscrowAmount !== expected.grossEscrowAmount || snapshot.pricingVersion !== expected.pricingVersion) {
                throw new PaymentError_1.PaymentError("Standard pricing snapshot is inconsistent.", "INVALID_PRICING_SNAPSHOT");
            }
        }
        if (snapshot.pricingPolicy === paymentPricingPolicy_enum_1.PaymentPricingPolicy.LEGACY_NO_CUSTOMER_FEE && (snapshot.customerFeeRateBps !== 0 || snapshot.customerFeeAmount !== 0 || snapshot.grossEscrowAmount !== snapshot.serviceAmount || snapshot.pricingVersion !== 0)) {
            throw new PaymentError_1.PaymentError("Legacy pricing snapshot is inconsistent.", "INVALID_PRICING_SNAPSHOT");
        }
    }
}
exports.PaymentPricingService = PaymentPricingService;
exports.paymentPricingService = new PaymentPricingService();
