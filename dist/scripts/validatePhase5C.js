"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const settlementCalculation_service_1 = require("../services/financial/settlementCalculation.service");
const paymentPricingPolicy_enum_1 = require("../enums/financial/paymentPricingPolicy.enum");
const result = (0, settlementCalculation_service_1.calculateSettlement)({ serviceAmount: 100000, customerFeeAmount: 5000, grossEscrowAmount: 105000, paymentAmount: 105000, currency: "INR", pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1, pricingVersion: 1 });
strict_1.default.equal(result.platformCommissionAmount, 20000);
strict_1.default.equal(result.creatorNetAmount, 80000);
strict_1.default.equal(result.platformRevenueAmount, 25000);
strict_1.default.equal(result.creatorNetAmount + result.platformRevenueAmount, result.grossEscrowAmount);
strict_1.default.throws(() => (0, settlementCalculation_service_1.calculateSettlement)({ ...result, paymentAmount: 100000, pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1, pricingVersion: 1 }));
console.log("Phase 5C focused assertions passed.");
