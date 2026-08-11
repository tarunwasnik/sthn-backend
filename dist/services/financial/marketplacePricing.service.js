"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplacePricingService = exports.MarketplacePricingService = exports.CREATOR_COMMISSION_RATE_BPS = exports.CUSTOMER_PLATFORM_FEE_RATE_BPS = void 0;
const financialLimits_1 = require("../../constants/financial/financialLimits");
exports.CUSTOMER_PLATFORM_FEE_RATE_BPS = 500;
exports.CREATOR_COMMISSION_RATE_BPS = 2000;
const BPS_DENOMINATOR = 10000;
const ROUNDING_OFFSET = BPS_DENOMINATOR / 2;
const calculateBps = (amount, rateBps) => {
    const scaled = amount * rateBps;
    if (!Number.isSafeInteger(scaled) ||
        !Number.isSafeInteger(scaled + ROUNDING_OFFSET)) {
        throw new Error("Marketplace pricing exceeds safe integer limits.");
    }
    return Math.floor((scaled + ROUNDING_OFFSET) / BPS_DENOMINATOR);
};
class MarketplacePricingService {
    calculate(input) {
        if (!Number.isSafeInteger(input.serviceAmount) ||
            input.serviceAmount < financialLimits_1.FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT) {
            throw new Error("Service amount must be a positive safe integer.");
        }
        const platformFeeAmount = calculateBps(input.serviceAmount, exports.CUSTOMER_PLATFORM_FEE_RATE_BPS);
        const commissionAmount = calculateBps(input.serviceAmount, exports.CREATOR_COMMISSION_RATE_BPS);
        const creatorAmount = input.serviceAmount - commissionAmount;
        const totalAmount = input.serviceAmount + platformFeeAmount;
        if (![platformFeeAmount, commissionAmount, creatorAmount, totalAmount]
            .every(Number.isSafeInteger) || creatorAmount < 1 ||
            totalAmount > financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT ||
            creatorAmount + commissionAmount !== input.serviceAmount ||
            input.serviceAmount + platformFeeAmount !== totalAmount) {
            throw new Error("Marketplace pricing snapshot does not reconcile.");
        }
        return { serviceAmount: input.serviceAmount, platformFeeAmount,
            commissionAmount, creatorAmount, totalAmount, currency: input.currency };
    }
    validate(snapshot) {
        const expected = this.calculate({ serviceAmount: snapshot.serviceAmount,
            currency: snapshot.currency });
        for (const field of ["platformFeeAmount", "commissionAmount",
            "creatorAmount", "totalAmount"]) {
            if (snapshot[field] !== expected[field]) {
                throw new Error("Marketplace pricing snapshot conflicts.");
            }
        }
    }
}
exports.MarketplacePricingService = MarketplacePricingService;
exports.marketplacePricingService = new MarketplacePricingService();
