// backend/src/services/financial/refund.service.ts

import mongoose from "mongoose";

import { IRefund } from "../../models/refund.model";

import { refundRepository } from "../../repositories/refund.repository";

import { Money } from "../../types/financial/money.type";

import { isValidMoney } from "../../utils/financial/money.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

import { generateIdempotencyKey } from "../../utils/financial/idempotency.util";

import { RefundError } from "../../errors/financial/RefundError";

import { RefundStatus } from "../../enums/financial/refundStatus.enum";

import { RefundReason } from "../../enums/financial/refundReason.enum";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

export interface CreateRefundInput {
  paymentId: string;

  bookingId: string;

  userId: string;

  creatorId: string;

  amount: Money;

  reason?: RefundReason;

  provider?: PaymentProvider;

  providerRefundId?: string;

  providerPaymentId?: string;

  settlementId?: string;

  idempotencyKey?: string;

  providerPayload?: Record<string, unknown>;

  attributes?: Record<string, unknown>;
}

export class RefundService {
  constructor(private readonly repository = refundRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private validateObjectId(value: string, field: string): void {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new RefundError(`Invalid ${field}.`);
    }
  }

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new RefundError("Invalid refund amount.");
    }
  }

  private async getRefundDocument(refundId: string): Promise<IRefund> {
    this.validateObjectId(refundId, "refund id");

    const refund = await this.repository.findById(refundId);

    if (!refund) {
      throw new RefundError("Refund not found.");
    }

    return refund;
  }

  private async save(
    refund: IRefund,
    update: Record<string, unknown>,
  ): Promise<IRefund> {
    const updated = await this.repository.updateById(
      refund._id.toString(),
      update,
    );

    if (!updated) {
      throw new RefundError("Failed to update refund.");
    }

    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* Creation                                                                    */
  /* -------------------------------------------------------------------------- */

  async createRefund(input: CreateRefundInput): Promise<IRefund> {
    this.validateObjectId(input.paymentId, "payment id");

    this.validateObjectId(input.bookingId, "booking id");

    this.validateObjectId(input.userId, "user id");

    this.validateObjectId(input.creatorId, "creator id");

    this.validateMoney(input.amount);

    return this.repository.create({
      refundReference: generateFinancialReference("REFUND"),

      paymentId: new mongoose.Types.ObjectId(input.paymentId),

      bookingId: new mongoose.Types.ObjectId(input.bookingId),

      userId: new mongoose.Types.ObjectId(input.userId),

      creatorId: new mongoose.Types.ObjectId(input.creatorId),

      amount: input.amount.amount,

      currency: input.amount.currency,

      status: RefundStatus.CREATED,

      reason: input.reason ?? RefundReason.OTHER,

      provider: input.provider ?? PaymentProvider.INTERNAL,

      providerRefundId: input.providerRefundId,

      providerPaymentId: input.providerPaymentId,

      settlementId: input.settlementId,

      attemptNumber: 1,

      retryable: true,

      idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),

      providerPayload: input.providerPayload ?? {},

      attributes: input.attributes ?? {},
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Reads                                                                       */
  /* -------------------------------------------------------------------------- */

  async getRefund(refundId: string): Promise<IRefund> {
    return this.getRefundDocument(refundId);
  }

  async getByReference(refundReference: string): Promise<IRefund> {
    const refund = await this.repository.findByRefundReference(refundReference);

    if (!refund) {
      throw new RefundError("Refund not found.");
    }

    return refund;
  }

  async getByPayment(paymentId: string): Promise<IRefund[]> {
    this.validateObjectId(paymentId, "payment id");

    return this.repository.findByPaymentId(paymentId);
  }

  async getByBooking(bookingId: string): Promise<IRefund[]> {
    this.validateObjectId(bookingId, "booking id");

    return this.repository.findByBookingId(bookingId);
  }

  async getByUser(userId: string): Promise<IRefund[]> {
    this.validateObjectId(userId, "user id");

    return this.repository.findByUserId(userId);
  }

  async getByCreator(creatorId: string): Promise<IRefund[]> {
    this.validateObjectId(creatorId, "creator id");

    return this.repository.findByCreatorId(creatorId);
  }

  /* -------------------------------------------------------------------------- */
  /* Status                                                                      */
  /* -------------------------------------------------------------------------- */

  async updateStatus(refundId: string, status: RefundStatus): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      status,
    });
  }

  async markProcessing(refundId: string): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      status: RefundStatus.PROCESSING,
    });
  }

  async markCompleted(
    refundId: string,
    providerRefundId?: string,
  ): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      status: RefundStatus.COMPLETED,

      providerRefundId,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Failure                                                                     */
  /* -------------------------------------------------------------------------- */

  async markFailed(refundId: string, message?: string): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      status: RefundStatus.FAILED,

      failureMessage: message,

      attemptNumber: refund.attemptNumber + 1,
    });
  }

  async markCancelled(refundId: string): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      status: RefundStatus.CANCELLED,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Provider                                                                    */
  /* -------------------------------------------------------------------------- */

  async updateProviderReferences(
    refundId: string,
    data: {
      providerRefundId?: string;
      providerPaymentId?: string;
      settlementId?: string;
    },
  ): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      ...data,
    });
  }

  async updateProviderPayload(
    refundId: string,
    payload: Record<string, unknown>,
  ): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      providerPayload: payload,
    });
  }

  async updateAttributes(
    refundId: string,
    attributes: Record<string, unknown>,
  ): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      attributes,
    });
  }

  async setRetryable(refundId: string, retryable: boolean): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, {
      retryable,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  async exists(refundId: string): Promise<boolean> {
    this.validateObjectId(refundId, "refund id");

    return this.repository.exists({
      _id: new mongoose.Types.ObjectId(refundId),
    });
  }

  async existsByReference(refundReference: string): Promise<boolean> {
    return this.repository.exists({
      refundReference,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IRefund | null> {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  async verifyIntegrity(refundId: string): Promise<boolean> {
    const refund = await this.getRefundDocument(refundId);

    return (
      refund.amount > 0 &&
      refund.refundReference.length > 0 &&
      refund.currency.length > 0 &&
      refund.idempotencyKey.length > 0
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Repository Helpers                                                  */
  /* -------------------------------------------------------------------------- */

  async findOne(filter: Record<string, unknown>): Promise<IRefund | null> {
    return this.repository.findOne(filter);
  }

  async findMany(filter: Record<string, unknown>): Promise<IRefund[]> {
    return this.repository.findMany(filter);
  }

  async update(
    refundId: string,
    update: Record<string, unknown>,
  ): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    return this.save(refund, update);
  }

  async deleteRefund(refundId: string): Promise<IRefund> {
    const refund = await this.getRefundDocument(refundId);

    const deleted = await this.repository.deleteById(refund._id.toString());

    if (!deleted) {
      throw new RefundError("Failed to delete refund.");
    }

    return deleted;
  }
}

export const refundService = new RefundService();
