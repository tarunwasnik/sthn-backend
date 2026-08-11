// backend/src/types/financial/payoutMetadata.type.ts

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PayoutStatus } from "../../enums/financial/payoutStatus.enum";

/**
 * Additional metadata associated with a payout.
 *
 * This structure stores provider-specific and operational information
 * while keeping the Payout model provider-independent.
 */
export interface PayoutMetadata {
  /**
   * Provider responsible for executing the payout.
   */
  provider: PaymentProvider;

  /**
   * Current payout status.
   */
  status: PayoutStatus;

  /**
   * Provider payout reference.
   */
  providerPayoutId?: string;

  /**
   * Provider transfer reference.
   */
  providerTransferId?: string;

  /**
   * Provider beneficiary/account reference.
   */
  beneficiaryId?: string;

  /**
   * Number of payout attempts.
   */
  attemptNumber?: number;

  /**
   * Indicates whether the payout can be retried.
   */
  retryable?: boolean;

  /**
   * Human-readable failure message.
   */
  failureMessage?: string;

  /**
   * Idempotency key used for this payout operation.
   */
  idempotencyKey?: string;

  /**
   * Expected settlement date returned by the provider.
   */
  expectedSettlementAt?: Date;

  /**
   * Provider payload retained for auditing/debugging.
   * Must never contain secrets or credentials.
   */
  providerPayload?: Record<string, unknown>;

  /**
   * Additional extensible metadata.
   */
  attributes?: Record<string, unknown>;
}
