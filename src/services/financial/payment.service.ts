// backend/src/services/financial/payment.service.ts

import mongoose from "mongoose";

import { IPayment } from "../../models/payment.model";

import { paymentRepository } from "../../repositories/payment.repository";

import { Money } from "../../types/financial/money.type";

import { isValidMoney } from "../../utils/financial/money.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

import { generateIdempotencyKey } from "../../utils/financial/idempotency.util";

import { PaymentError } from "../../errors/financial/PaymentError";

import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";

import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { PaymentPricingSnapshot, paymentPricingService } from "./paymentPricing.service";

export interface CreatePaymentInput {
  bookingId: string;

  userId: string;

  creatorId: string;

  /** Authoritative booking service amount. The Financial Domain derives gross amount. */
  serviceAmount: Money;

  provider?: PaymentProvider;

  method?: PaymentMethod;

  providerPaymentId?: string;

  providerOrderId?: string;

  providerTransactionId?: string;

  authorizationId?: string;

  settlementId?: string;

  idempotencyKey?: string;

  providerPayload?: Record<string, unknown>;

  attributes?: Record<string, unknown>;
  pricingSnapshot?: PaymentPricingSnapshot;

  /**
   * Allows callers that already coordinate a MongoDB transaction to persist
   * the financial payment atomically with the originating aggregate.
   */
  session?: mongoose.ClientSession;
}

export class PaymentService {
  constructor(private readonly repository = paymentRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private validateObjectId(value: string, field: string): void {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new PaymentError(`Invalid ${field}.`);
    }
  }

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new PaymentError("Invalid payment amount.");
    }
  }

  private async getPaymentDocument(paymentId: string): Promise<IPayment> {
    this.validateObjectId(paymentId, "payment id");

    const payment = await this.repository.findById(
      new mongoose.Types.ObjectId(paymentId),
    );

    if (!payment) {
      throw new PaymentError("Payment not found.");
    }

    return payment;
  }

  private async save(
    _payment: IPayment,
    _update: Record<string, unknown>,
  ): Promise<never> {
    throw new PaymentError(
      "Legacy generic Payment mutation is disabled; use PaymentLifecycleService.",
      "PAYMENT_INVALID_TRANSITION",
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Creation                                                                    */
  /* -------------------------------------------------------------------------- */

  async createPayment(input: CreatePaymentInput): Promise<IPayment> {
    this.validateObjectId(input.bookingId, "booking id");

    this.validateObjectId(input.userId, "user id");

    this.validateObjectId(input.creatorId, "creator id");

    this.validateMoney(input.serviceAmount);
    const pricing = input.pricingSnapshot ?? paymentPricingService.calculateStandardPricing({
      serviceAmount: input.serviceAmount.amount,
      currency: input.serviceAmount.currency,
    });
    paymentPricingService.validateSnapshot(pricing);
    if (pricing.currency !== input.serviceAmount.currency) {
      throw new PaymentError("Payment pricing currency is inconsistent.", "INVALID_PRICING_SNAPSHOT");
    }

    if (input.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(
        input.idempotencyKey,
      );

      if (existing) {
        return existing;
      }
    }

    return this.repository.create({
      paymentReference: generateFinancialReference("PAYMENT"),

      bookingId: new mongoose.Types.ObjectId(input.bookingId),

      userId: new mongoose.Types.ObjectId(input.userId),

      creatorId: new mongoose.Types.ObjectId(input.creatorId),

      // `amount` is the one canonical provider/capture amount for new payments.
      amount: pricing.grossEscrowAmount,

      currency: pricing.currency,
      serviceAmount: pricing.serviceAmount,
      customerFeeRateBps: pricing.customerFeeRateBps,
      customerFeeAmount: pricing.customerFeeAmount,
      grossEscrowAmount: pricing.grossEscrowAmount,
      pricingPolicy: pricing.pricingPolicy,
      pricingVersion: pricing.pricingVersion,
      pricingCalculatedAt: new Date(),

      provider: input.provider ?? PaymentProvider.INTERNAL,

      method: input.method ?? PaymentMethod.INTERNAL,

      status: PaymentStatus.CREATED,

      providerPaymentId: input.providerPaymentId,

      providerOrderId: input.providerOrderId,

      providerTransactionId: input.providerTransactionId,

      authorizationId: input.authorizationId,

      settlementId: input.settlementId,

      attemptNumber: 1,

      retryable: true,

      failureReason: PaymentFailureReason.NONE,

      idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),

      providerPayload: input.providerPayload ?? {},

      attributes: input.attributes ?? {},
    }, input.session);
  }
  /* -------------------------------------------------------------------------- */
  /* Reads                                                                       */
  /* -------------------------------------------------------------------------- */

  async getPayment(paymentId: string): Promise<IPayment> {
    return this.getPaymentDocument(paymentId);
  }

  async getByReference(paymentReference: string): Promise<IPayment> {
    const payment =
      await this.repository.findByPaymentReference(paymentReference);

    if (!payment) {
      throw new PaymentError("Payment not found.");
    }

    return payment;
  }

  async getByBooking(bookingId: string): Promise<IPayment[]> {
    this.validateObjectId(bookingId, "booking id");

    return this.repository.findByBookingId(
      new mongoose.Types.ObjectId(bookingId),
    );
  }

  async getByUser(userId: string): Promise<IPayment[]> {
    this.validateObjectId(userId, "user id");

    return this.repository.findByUserId(new mongoose.Types.ObjectId(userId));
  }

  async getByCreator(creatorId: string): Promise<IPayment[]> {
    this.validateObjectId(creatorId, "creator id");

    return this.repository.findByCreatorId(
      new mongoose.Types.ObjectId(creatorId),
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Status                                                                      */
  /* -------------------------------------------------------------------------- */

  async updateStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status,
    });
  }

  /**
   * Marks a payment as initializing.
   *
   * This state indicates that payment processing has started
   * and the provider is being contacted.
   */
  async markInitializing(paymentId: string): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.INITIALIZING,
    });
  }

  /**
   * Marks a payment as pending.
   *
   * This state indicates that the payment request has been
   * accepted by the provider and is awaiting authorization
   * or further processing.
   */
  async markPending(paymentId: string): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.PENDING,
    });
  }

  async markAuthorized(
    paymentId: string,
    authorizationId: string,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.AUTHORIZED,

      authorizationId,
    });
  }

  async markCaptured(
    paymentId: string,
    providerTransactionId: string,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.CAPTURED,

      providerTransactionId,
    });
  }

  async markSettled(
    paymentId: string,
    settlementId: string,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.SETTLED,

      settlementId,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Failure                                                                     */
  /* -------------------------------------------------------------------------- */

  async markFailed(
    paymentId: string,
    reason: PaymentFailureReason,
    message?: string,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.FAILED,

      failureReason: reason,

      failureMessage: message,

      attemptNumber: payment.attemptNumber + 1,
    });
  }

  async markCancelled(paymentId: string): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.CANCELLED,
    });
  }

  async markRefunded(paymentId: string): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      status: PaymentStatus.REFUNDED,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Provider                                                                    */
  /* -------------------------------------------------------------------------- */

  async updateProviderReferences(
    paymentId: string,
    data: {
      providerPaymentId?: string;
      providerOrderId?: string;
      providerTransactionId?: string;
      authorizationId?: string;
      settlementId?: string;
    },
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      ...data,
    });
  }

  async updateProviderPayload(
    paymentId: string,
    payload: Record<string, unknown>,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      providerPayload: payload,
    });
  }

  async updateAttributes(
    paymentId: string,
    attributes: Record<string, unknown>,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      attributes,
    });
  }

  async setRetryable(paymentId: string, retryable: boolean): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, {
      retryable,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  async exists(paymentId: string): Promise<boolean> {
    this.validateObjectId(paymentId, "payment id");

    return this.repository.exists({
      _id: new mongoose.Types.ObjectId(paymentId),
    });
  }

  async existsByReference(paymentReference: string): Promise<boolean> {
    return this.repository.exists({
      paymentReference,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IPayment | null> {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  async verifyIntegrity(paymentId: string): Promise<boolean> {
    const payment = await this.getPaymentDocument(paymentId);

    return (
      payment.amount > 0 &&
      payment.paymentReference.length > 0 &&
      payment.currency.length > 0 &&
      payment.idempotencyKey.length > 0
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Repository Helpers                                                  */
  /* -------------------------------------------------------------------------- */

  async findOne(filter: Record<string, unknown>): Promise<IPayment | null> {
    return this.repository.findOne(filter);
  }

  async findMany(filter: Record<string, unknown>): Promise<IPayment[]> {
    return this.repository.findMany(filter);
  }

  async update(
    paymentId: string,
    update: Record<string, unknown>,
  ): Promise<IPayment> {
    const payment = await this.getPaymentDocument(paymentId);

    return this.save(payment, update);
  }

  async deletePayment(paymentId: string): Promise<IPayment> {
    await this.getPaymentDocument(paymentId);
    throw new PaymentError(
      "Financial Payments cannot be deleted through the application.",
      "PAYMENT_DELETION_NOT_ALLOWED",
    );
  }
}

export const paymentService = new PaymentService();
