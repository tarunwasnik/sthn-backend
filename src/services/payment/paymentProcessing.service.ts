// backend/src/services/payment/paymentProcessing.service.ts

import { IPayment } from "../../models/payment.model";

import { paymentService } from "../financial/payment.service";
import {
  paymentProviderService,
  PaymentProviderResult,
} from "./provider/paymentProvider.service";

import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";

import { PaymentError } from "../../errors/financial/PaymentError";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Processing Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Orchestrates the complete payment processing lifecycle.
 *
 * This service DOES NOT:
 * - Create payment records
 * - Persist directly through repositories
 * - Communicate directly with provider SDKs
 * - Modify Wallets
 * - Create Ledger entries
 * - Execute Settlements
 * - Execute Refunds
 *
 * This service DOES:
 * - Load payments
 * - Validate processing eligibility
 * - Delegate execution to PaymentProviderService
 * - Synchronize provider state
 * - Continue the payment lifecycle
 * - Handle failures
 *
 * Provider-specific implementations live inside:
 * paymentProvider.service.ts
 * ============================================================
 */

export interface PaymentProcessingResult {
  success: boolean;
  payment: IPayment;
  message: string;
}

export class PaymentProcessingService {
  constructor(
    private readonly payments = paymentService,
    private readonly providers = paymentProviderService,
  ) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                    */
  /* -------------------------------------------------------------------------- */

  /**
   * Loads a payment or throws.
   */
  private async getPayment(paymentId: string): Promise<IPayment> {
    return this.payments.getPayment(paymentId);
  }

  /**
   * Ensures the payment is eligible for processing.
   */
  private ensureProcessable(payment: IPayment): void {
    if (payment.status !== PaymentStatus.CREATED) {
      throw new PaymentError(
        `Payment cannot be processed from status "${payment.status}".`,
      );
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Processing                                                                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Delegates execution to the configured payment provider.
   */
  private async processWithProvider(
    payment: IPayment,
  ): Promise<PaymentProcessingResult> {
    const providerResult = await this.providers.process(payment);

    if (!providerResult.success) {
      const failedPayment = await this.failPayment(
        payment,
        PaymentFailureReason.PROVIDER_ERROR,
        providerResult.message,
      );

      return {
        success: false,
        payment: failedPayment,
        message:
          providerResult.message ?? "Payment provider processing failed.",
      };
    }

    if (providerResult.providerPayload) {
      await this.payments.updateProviderPayload(
        payment._id.toString(),
        providerResult.providerPayload,
      );
    }

    await this.payments.updateProviderReferences(payment._id.toString(), {
      authorizationId: providerResult.authorizationId,

      providerPaymentId: providerResult.providerPaymentId,

      providerOrderId: providerResult.providerOrderId,

      providerTransactionId: providerResult.providerTransactionId,

      settlementId: providerResult.settlementId,
    });

    const synchronizedPayment = await this.synchronizeProviderState(
      payment,
      providerResult,
    );

    const processedPayment = await this.continuePaymentLifecycle(
      synchronizedPayment,
      providerResult,
    );

    return {
      success: true,
      payment: processedPayment,
      message: providerResult.message ?? "Payment processed successfully.",
    };
  }

  /**
   * Processes a payment.
   *
   * Flow
   * ----
   * 1. Load payment
   * 2. Validate eligibility
   * 3. Mark INITIALIZING
   * 4. Execute provider
   * 5. Synchronize provider state
   * 6. Continue remaining lifecycle
   * 7. Return final payment
   */
  async processPayment(paymentId: string): Promise<PaymentProcessingResult> {
    const payment = await this.getPayment(paymentId);

    this.ensureProcessable(payment);

    try {
      const initializing = await this.payments.markInitializing(
        payment._id.toString(),
      );

      return await this.processWithProvider(initializing);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown payment processing error.";

      const failedPayment = await this.payments.markFailed(
        payment._id.toString(),
        PaymentFailureReason.INTERNAL_ERROR,
        message,
      );

      return {
        success: false,
        payment: failedPayment,
        message,
      };
    }
  }

  /**
   * Processes multiple payments sequentially.
   */
  async processPayments(
    paymentIds: string[],
  ): Promise<PaymentProcessingResult[]> {
    const results: PaymentProcessingResult[] = [];

    for (const paymentId of paymentIds) {
      results.push(await this.processPayment(paymentId));
    }

    return results;
  }

  /**
   * Determines whether a payment can be processed.
   */
  async canProcess(paymentId: string): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    return payment.status === PaymentStatus.CREATED;
  }

  /**
   * Returns the current processing state.
   */
  async getProcessingState(paymentId: string): Promise<PaymentStatus> {
    const payment = await this.getPayment(paymentId);

    return payment.status;
  }
  /* -------------------------------------------------------------------------- */
  /* Lifecycle Helpers                                                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Synchronizes the payment state with the provider-reported
   * lifecycle state before local orchestration continues.
   */
  private async synchronizeProviderState(
    payment: IPayment,
    providerResult: PaymentProviderResult,
  ): Promise<IPayment> {
    const providerStatus = providerResult.status ?? PaymentStatus.AUTHORIZED;

    switch (providerStatus) {
      case PaymentStatus.PENDING:
        return this.payments.markPending(payment._id.toString());

      case PaymentStatus.AUTHORIZED:
        return this.payments.markAuthorized(
          payment._id.toString(),
          providerResult.authorizationId ?? `AUTH-${Date.now()}`,
        );

      case PaymentStatus.CAPTURED:
        return this.payments.markCaptured(
          payment._id.toString(),
          providerResult.providerTransactionId ?? `TXN-${Date.now()}`,
        );

      case PaymentStatus.SETTLED:
        return this.payments.markSettled(
          payment._id.toString(),
          providerResult.settlementId ?? `SET-${Date.now()}`,
        );

      default:
        throw new PaymentError(
          `Unsupported provider status "${providerStatus}".`,
        );
    }
  }

  /**
   * Marks the payment as authorized.
   *
   * Provider-generated authorization identifiers are reused
   * whenever available. Internal providers may generate a
   * fallback identifier.
   */
  private async authorizePayment(
    payment: IPayment,
    authorizationId?: string,
  ): Promise<IPayment> {
    return this.payments.markAuthorized(
      payment._id.toString(),
      authorizationId ?? `AUTH-${Date.now()}`,
    );
  }

  /**
   * Marks the payment as captured.
   *
   * Provider-generated transaction identifiers are reused
   * whenever available.
   */
  private async capturePayment(
    payment: IPayment,
    providerTransactionId?: string,
  ): Promise<IPayment> {
    return this.payments.markCaptured(
      payment._id.toString(),
      providerTransactionId ?? `TXN-${Date.now()}`,
    );
  }

  /**
   * Marks the payment as settled.
   *
   * This method only updates payment state.
   *
   * Ledger posting, wallet synchronization,
   * settlements and earnings distribution are
   * implemented in later Financial phases.
   */
  private async settlePayment(
    payment: IPayment,
    settlementId?: string,
  ): Promise<IPayment> {
    return this.payments.markSettled(
      payment._id.toString(),
      settlementId ?? `SET-${Date.now()}`,
    );
  }

  /**
   * Continues the payment lifecycle from the
   * provider-reported state.
   */
  private async continuePaymentLifecycle(
    payment: IPayment,
    providerResult: PaymentProviderResult,
  ): Promise<IPayment> {
    const providerStatus = providerResult.status ?? PaymentStatus.AUTHORIZED;

    switch (providerStatus) {
      case PaymentStatus.PENDING:
        return this.completeFromPending(payment, providerResult);

      case PaymentStatus.AUTHORIZED:
        return this.completeFromAuthorized(payment, providerResult);

      case PaymentStatus.CAPTURED:
        return this.completeFromCaptured(payment, providerResult);

      case PaymentStatus.SETTLED:
        return payment;

      default:
        throw new PaymentError(
          `Unsupported provider lifecycle state "${providerStatus}".`,
        );
    }
  }

  /**
   * Continues processing from PENDING.
   *
   * Remaining flow:
   *
   * PENDING
   *      ↓
   * AUTHORIZED
   *      ↓
   * CAPTURED
   *      ↓
   * SETTLED
   */
  private async completeFromPending(
    payment: IPayment,
    providerResult: PaymentProviderResult,
  ): Promise<IPayment> {
    const authorized = await this.authorizePayment(
      payment,
      providerResult.authorizationId,
    );

    return this.completeFromAuthorized(authorized, providerResult);
  }

  /**
   * Continues processing from AUTHORIZED.
   *
   * Remaining flow:
   *
   * AUTHORIZED
   *      ↓
   * CAPTURED
   *      ↓
   * SETTLED
   */
  private async completeFromAuthorized(
    payment: IPayment,
    providerResult: PaymentProviderResult,
  ): Promise<IPayment> {
    const captured = await this.capturePayment(
      payment,
      providerResult.providerTransactionId,
    );

    return this.completeFromCaptured(captured, providerResult);
  }

  /**
   * Continues processing from CAPTURED.
   *
   * Remaining flow:
   *
   * CAPTURED
   *      ↓
   * SETTLED
   */
  private async completeFromCaptured(
    payment: IPayment,
    providerResult: PaymentProviderResult,
  ): Promise<IPayment> {
    return this.settlePayment(payment, providerResult.settlementId);
  }
  /* -------------------------------------------------------------------------- */
  /* Failure / Cancellation / Retry                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Marks a payment as failed.
   */
  private async failPayment(
    payment: IPayment,
    reason: PaymentFailureReason,
    message?: string,
  ): Promise<IPayment> {
    return this.payments.markFailed(payment._id.toString(), reason, message);
  }

  /**
   * Cancels a payment.
   *
   * Only unsettled payments may be cancelled.
   */
  async cancelPayment(paymentId: string): Promise<PaymentProcessingResult> {
    const payment = await this.getPayment(paymentId);

    switch (payment.status) {
      case PaymentStatus.CREATED:
      case PaymentStatus.INITIALIZING:
      case PaymentStatus.PENDING:
      case PaymentStatus.AUTHORIZED:
      case PaymentStatus.CAPTURED:
        break;

      default:
        throw new PaymentError(
          `Payment cannot be cancelled from status "${payment.status}".`,
        );
    }

    const cancelled = await this.payments.markCancelled(payment._id.toString());

    return {
      success: true,
      payment: cancelled,
      message: "Payment cancelled successfully.",
    };
  }

  /**
   * Determines whether a payment may be retried.
   */
  async canRetry(paymentId: string): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    return payment.retryable && payment.status === PaymentStatus.FAILED;
  }

  /**
   * Re-processes a previously failed payment.
   */
  async retryPayment(paymentId: string): Promise<PaymentProcessingResult> {
    const payment = await this.getPayment(paymentId);

    if (!payment.retryable) {
      throw new PaymentError("Payment retries are disabled.");
    }

    if (payment.status !== PaymentStatus.FAILED) {
      throw new PaymentError("Only failed payments can be retried.");
    }

    await this.payments.updateStatus(
      payment._id.toString(),
      PaymentStatus.CREATED,
    );

    return this.processPayment(payment._id.toString());
  }

  /**
   * Permanently disables payment retries.
   */
  async disableRetries(paymentId: string): Promise<IPayment> {
    return this.payments.setRetryable(paymentId, false);
  }
}

export const paymentProcessingService = new PaymentProcessingService();
