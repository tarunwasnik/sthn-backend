// backend/src/services/payment/paymentValidation.service.ts

import { IPayment } from "../../models/payment.model";

import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

import { PaymentError } from "../../errors/financial/PaymentError";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Validation Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Centralizes all payment validation rules.
 *
 * This service performs validation only.
 *
 * It NEVER:
 * - Updates payments
 * - Calls payment providers
 * - Creates ledger entries
 * - Updates wallets
 * - Changes booking state
 *
 * This service validates:
 * - Payment processing eligibility
 * - Provider support
 * - Retry eligibility
 * - Cancellation eligibility
 * - Status transitions
 * - Amount rules
 * - Currency rules
 *
 * Future phases will extend this service with:
 * - Booking validation
 * - Refund validation
 * - Settlement validation
 * - Chargeback validation
 * ============================================================
 */

export class PaymentValidationService {
  /**
   * Ensures the payment may be processed.
   */
  validateProcessable(payment: IPayment): void {
    if (payment.status !== PaymentStatus.CREATED) {
      throw new PaymentError(
        `Payment cannot be processed from status "${payment.status}".`,
      );
    }
  }

  /**
   * Ensures the payment provider is supported.
   */
  validateProvider(payment: IPayment): void {
    switch (payment.provider) {
      case PaymentProvider.INTERNAL:
        return;

      default:
        throw new PaymentError(
          `Unsupported payment provider "${payment.provider}".`,
        );
    }
  }

  /**
   * Ensures payment amount is valid.
   */
  validateAmount(payment: IPayment): void {
    if (payment.amount <= 0) {
      throw new PaymentError("Payment amount must be greater than zero.");
    }
  }
  /**
   * Ensures the payment may be cancelled.
   */
  validateCancellation(payment: IPayment): void {
    switch (payment.status) {
      case PaymentStatus.CREATED:
      case PaymentStatus.AUTHORIZED:
      case PaymentStatus.CAPTURED:
        return;

      default:
        throw new PaymentError(
          `Payment cannot be cancelled from status "${payment.status}".`,
        );
    }
  }

  /**
   * Ensures the payment may be retried.
   */
  validateRetry(payment: IPayment): void {
    if (!payment.retryable) {
      throw new PaymentError("Payment retries are disabled.");
    }

    if (payment.status !== PaymentStatus.FAILED) {
      throw new PaymentError("Only failed payments can be retried.");
    }
  }

  /**
   * Ensures a payment status transition is valid.
   */
  validateStatusTransition(current: PaymentStatus, next: PaymentStatus): void {
    const transitions: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
      [PaymentStatus.CREATED]: [
        PaymentStatus.INITIALIZING,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
        PaymentStatus.EXPIRED,
      ],

      [PaymentStatus.INITIALIZING]: [
        PaymentStatus.PENDING,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
      ],

      [PaymentStatus.PENDING]: [
        PaymentStatus.AUTHORIZED,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
        PaymentStatus.EXPIRED,
      ],

      [PaymentStatus.AUTHORIZED]: [
        PaymentStatus.CAPTURED,
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
      ],

      [PaymentStatus.CAPTURED]: [PaymentStatus.SETTLED, PaymentStatus.FAILED],

      [PaymentStatus.SETTLED]: [
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED,
      ],

      [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],

      [PaymentStatus.REFUNDED]: [],

      [PaymentStatus.FAILED]: [PaymentStatus.CREATED],

      [PaymentStatus.EXPIRED]: [],

      [PaymentStatus.CANCELLED]: [],
    };

    const allowed = transitions[current] ?? [];

    if (!allowed.includes(next)) {
      throw new PaymentError(
        `Invalid payment status transition from "${current}" to "${next}".`,
      );
    }
  }

  /**
   * Ensures the payment currency is valid.
   */
  validateCurrency(payment: IPayment): void {
    if (!payment.currency || payment.currency.trim().length === 0) {
      throw new PaymentError("Payment currency is required.");
    }
  }
  /**
   * Runs the standard validation pipeline before payment
   * processing begins.
   */
  validate(payment: IPayment): void {
    this.validateAmount(payment);
    this.validateCurrency(payment);
    this.validateProvider(payment);
    this.validateProcessable(payment);
  }
}

export const paymentValidationService = new PaymentValidationService();
