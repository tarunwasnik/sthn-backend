// backend/src/constants/financial/financialDefaults.ts

import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PayoutStatus } from "../../enums/financial/payoutStatus.enum";
import { RefundReason } from "../../enums/financial/refundReason.enum";
import { RefundStatus } from "../../enums/financial/refundStatus.enum";
import { SettlementStatus } from "../../enums/financial/settlementStatus.enum";

/**
 * Canonical default values used throughout the Financial Domain.
 *
 * These defaults provide a single source of truth when initializing
 * payments, refunds, settlements, payouts, and related metadata.
 */
export const FINANCIAL_DEFAULTS = {
  payment: {
    provider: PaymentProvider.INTERNAL,
    method: PaymentMethod.INTERNAL,
    status: PaymentStatus.CREATED,
    retryable: true,
    attemptNumber: 1,
    failureReason: PaymentFailureReason.NONE,
  },

  refund: {
    status: RefundStatus.CREATED,
    reason: RefundReason.OTHER,
    retryable: true,
    attemptNumber: 1,
  },

  settlement: {
    status: SettlementStatus.CREATED,
  },

  payout: {
    status: PayoutStatus.CREATED,
    retryable: true,
    attemptNumber: 1,
  },

  metadata: {
    providerPayload: {},
    attributes: {},
  },
} as const;
