//backend/src/services/payment/paymentOrchestration.service.ts

import { Types } from "mongoose";

import { IPayment } from "../../models/payment.model";

import {
  paymentCreationService,
  CreatePaymentInput,
} from "./paymentCreation.service";

import { paymentValidationService } from "./paymentValidation.service";

import {
  paymentProcessingService,
  PaymentProcessingResult,
} from "./paymentProcessing.service";

import { paymentService } from "../financial/payment.service";

import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Orchestration Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Coordinates the complete payment workflow.
 *
 * This service represents the application-level entry point
 * for payment execution.
 *
 * It delegates responsibilities to specialized services and
 * never contains provider-specific logic.
 *
 * Responsibilities
 * ----------------
 * ✓ Validate payment request
 * ✓ Create payment
 * ✓ Process payment
 * ✓ Return final payment result
 *
 * This service DOES NOT:
 * ----------------------
 * ✗ Communicate with payment providers
 * ✗ Access repositories directly
 * ✗ Validate business rules itself
 * ✗ Execute lifecycle transitions
 * ✗ Create ledger entries
 * ✗ Update wallets
 * ✗ Perform settlements
 * ✗ Execute refunds
 * ============================================================
 */

export interface PaymentExecutionResult {
  success: boolean;

  payment: IPayment;

  processing: PaymentProcessingResult;

  message: string;
}

export class PaymentOrchestrationService {
  constructor(
    private readonly validator = paymentValidationService,

    private readonly creator = paymentCreationService,

    private readonly processor = paymentProcessingService,

    private readonly payments = paymentService,
  ) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                    */
  /* -------------------------------------------------------------------------- */

  /**
   * Loads a payment.
   */
  private async getPayment(
    paymentId: string | Types.ObjectId,
  ): Promise<IPayment> {
    return this.payments.getPayment(paymentId.toString());
  }

  /**
   * Ensures an existing payment can be processed.
   */
  private ensureProcessable(payment: IPayment): void {
    this.validator.validateProcessable(payment);
  }

  /* -------------------------------------------------------------------------- */
  /* Payment Execution                                                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Executes the complete payment workflow.
   *
   * Flow
   * ----
   * Create Payment
   *      ↓
   * Validate Payment
   *      ↓
   * Process Payment
   *      ↓
   * Return Final Result
   */
  async executePayment(
    request: CreatePaymentInput,
  ): Promise<PaymentExecutionResult> {
    const payment = await this.creator.createPayment(request);

    this.validator.validate(payment);

    const processing = await this.processor.processPayment(
      payment._id.toString(),
    );

    return {
      success: processing.success,
      payment: processing.payment,
      processing,
      message: processing.message,
    };
  }
  /**
   * Processes an existing payment.
   *
   * This is used when a payment has already been created
   * and only the processing lifecycle should be executed.
   */
  async processExistingPayment(
    paymentId: string | Types.ObjectId,
  ): Promise<PaymentProcessingResult> {
    const payment = await this.getPayment(paymentId);

    this.ensureProcessable(payment);

    return this.processor.processPayment(payment._id.toString());
  }

  /**
   * Returns the current processing state
   * of a payment.
   */
  async getPaymentStatus(
    paymentId: string | Types.ObjectId,
  ): Promise<PaymentStatus> {
    const payment = await this.getPayment(paymentId);

    return payment.status;
  }

  /**
   * Determines whether a payment
   * is eligible for processing.
   */
  async canProcessPayment(
    paymentId: string | Types.ObjectId,
  ): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    return payment.status === PaymentStatus.CREATED;
  }

  /**
   * Cancels an existing payment.
   */
  async cancelPayment(
    paymentId: string | Types.ObjectId,
  ): Promise<PaymentProcessingResult> {
    return this.processor.cancelPayment(paymentId.toString());
  }

  /**
   * Retries a failed payment.
   */
  async retryPayment(
    paymentId: string | Types.ObjectId,
  ): Promise<PaymentProcessingResult> {
    return this.processor.retryPayment(paymentId.toString());
  }

  /**
   * Determines whether a payment
   * may be retried.
   */
  async canRetryPayment(paymentId: string | Types.ObjectId): Promise<boolean> {
    return this.processor.canRetry(paymentId.toString());
  }

  /**
   * Permanently disables retries
   * for a payment.
   */
  async disableRetries(paymentId: string | Types.ObjectId): Promise<IPayment> {
    return this.processor.disableRetries(paymentId.toString());
  }
  /* -------------------------------------------------------------------------- */
  /* Read Helpers                                                               */
  /* -------------------------------------------------------------------------- */

  /**
   * Returns a payment by its identifier.
   */
  async getPaymentById(paymentId: string | Types.ObjectId): Promise<IPayment> {
    return this.getPayment(paymentId);
  }

  /**
   * Determines whether a payment has
   * completed successfully.
   */
  async isPaymentCompleted(
    paymentId: string | Types.ObjectId,
  ): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    return payment.status === PaymentStatus.SETTLED;
  }

  /**
   * Determines whether a payment
   * has failed.
   */
  async isPaymentFailed(paymentId: string | Types.ObjectId): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    return payment.status === PaymentStatus.FAILED;
  }

  /**
   * Determines whether a payment
   * is still active.
   */
  async isPaymentInProgress(
    paymentId: string | Types.ObjectId,
  ): Promise<boolean> {
    const payment = await this.getPayment(paymentId);

    switch (payment.status) {
      case PaymentStatus.CREATED:
      case PaymentStatus.INITIALIZING:
      case PaymentStatus.PENDING:
      case PaymentStatus.AUTHORIZED:
      case PaymentStatus.CAPTURED:
        return true;

      default:
        return false;
    }
  }
}

export const paymentOrchestrationService = new PaymentOrchestrationService();
