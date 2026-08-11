"use strict";
// backend/src/constants/financial/financialDefaults.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_DEFAULTS = void 0;
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const payoutStatus_enum_1 = require("../../enums/financial/payoutStatus.enum");
const refundReason_enum_1 = require("../../enums/financial/refundReason.enum");
const refundStatus_enum_1 = require("../../enums/financial/refundStatus.enum");
const settlementStatus_enum_1 = require("../../enums/financial/settlementStatus.enum");
/**
 * Canonical default values used throughout the Financial Domain.
 *
 * These defaults provide a single source of truth when initializing
 * payments, refunds, settlements, payouts, and related metadata.
 */
exports.FINANCIAL_DEFAULTS = {
    payment: {
        provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
        method: paymentMethod_enum_1.PaymentMethod.INTERNAL,
        status: paymentStatus_enum_1.PaymentStatus.CREATED,
        retryable: true,
        attemptNumber: 1,
        failureReason: paymentFailureReason_enum_1.PaymentFailureReason.NONE,
    },
    refund: {
        status: refundStatus_enum_1.RefundStatus.CREATED,
        reason: refundReason_enum_1.RefundReason.OTHER,
        retryable: true,
        attemptNumber: 1,
    },
    settlement: {
        status: settlementStatus_enum_1.SettlementStatus.CREATED,
    },
    payout: {
        status: payoutStatus_enum_1.PayoutStatus.CREATED,
        retryable: true,
        attemptNumber: 1,
    },
    metadata: {
        providerPayload: {},
        attributes: {},
    },
};
