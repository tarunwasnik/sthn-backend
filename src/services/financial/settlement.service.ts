// backend/src/services/financial/settlement.service.ts

import mongoose from "mongoose";

import { ISettlement } from "../../models/settlement.model";

import { settlementRepository } from "../../repositories/settlement.repository";

import { Money } from "../../types/financial/money.type";

import { isValidMoney } from "../../utils/financial/money.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

import { generateIdempotencyKey } from "../../utils/financial/idempotency.util";

import { SettlementError } from "../../errors/financial/SettlementError";

import { SettlementStatus } from "../../enums/financial/settlementStatus.enum";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

export interface CreateSettlementInput {
  bookingId: string;

  paymentId: string;

  userId: string;

  creatorId: string;

  amount: Money;

  provider?: PaymentProvider;

  providerSettlementId?: string;

  providerBatchId?: string;

  providerTransactionId?: string;

  idempotencyKey?: string;

  providerPayload?: Record<string, unknown>;

  attributes?: Record<string, unknown>;
}

export class SettlementService {
  constructor(private readonly repository = settlementRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private validateObjectId(value: string, field: string): void {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new SettlementError(`Invalid ${field}.`);
    }
  }

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new SettlementError("Invalid settlement amount.");
    }
  }

  private async getSettlementDocument(
    settlementId: string,
    session?: mongoose.ClientSession,
  ): Promise<ISettlement> {
    this.validateObjectId(settlementId, "settlement id");

    const settlement = await this.repository.findById(settlementId);

    if (!settlement) {
      throw new SettlementError("Settlement not found.");
    }

    return settlement;
  }

  private async save(
    settlement: ISettlement,
    update: Record<string, unknown>,
    session?: mongoose.ClientSession,
  ): Promise<ISettlement> {
    const updated = await this.repository.updateById(
      settlement._id.toString(),
      update,
      session,
    );

    if (!updated) {
      throw new SettlementError("Failed to update settlement.");
    }

    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* Creation                                                                    */
  /* -------------------------------------------------------------------------- */

  async createSettlement(input: CreateSettlementInput): Promise<ISettlement> {
    this.validateObjectId(input.bookingId, "booking id");

    this.validateObjectId(input.paymentId, "payment id");

    this.validateObjectId(input.userId, "user id");

    this.validateObjectId(input.creatorId, "creator id");

    this.validateMoney(input.amount);

    return this.repository.create({
      settlementReference: generateFinancialReference("SETTLEMENT"),

      bookingId: new mongoose.Types.ObjectId(input.bookingId),

      paymentId: new mongoose.Types.ObjectId(input.paymentId),

      userId: new mongoose.Types.ObjectId(input.userId),

      creatorId: new mongoose.Types.ObjectId(input.creatorId),

      amount: input.amount.amount,

      currency: input.amount.currency,

      status: SettlementStatus.CREATED,

      provider: input.provider ?? PaymentProvider.INTERNAL,

      providerSettlementId: input.providerSettlementId,

      providerBatchId: input.providerBatchId,

      providerTransactionId: input.providerTransactionId,

      attemptNumber: 1,

      retryable: true,

      idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),

      // Future Phase 5 settlement execution uses this canonical obligation
      // identity. It is partial-indexed so legacy incomplete records remain
      // deployable and reconciliation can classify them conservatively.
      financialObligationKey: `settlement-obligation:${input.bookingId}:${input.paymentId}`,

      providerPayload: input.providerPayload ?? {},

      attributes: input.attributes ?? {},
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Reads                                                                       */
  /* -------------------------------------------------------------------------- */

  async getSettlement(settlementId: string): Promise<ISettlement> {
    return this.getSettlementDocument(settlementId);
  }

  async getByReference(settlementReference: string): Promise<ISettlement> {
    const settlement =
      await this.repository.findBySettlementReference(settlementReference);

    if (!settlement) {
      throw new SettlementError("Settlement not found.");
    }

    return settlement;
  }

  async getByBooking(bookingId: string): Promise<ISettlement[]> {
    this.validateObjectId(bookingId, "booking id");

    return this.repository.findByBookingId(bookingId);
  }

  async getByPayment(
    paymentId: string,
    session?: mongoose.ClientSession,
  ): Promise<ISettlement[]> {
    this.validateObjectId(paymentId, "payment id");

    return this.repository.findByPaymentId(paymentId, session);
  }

  async getByUser(userId: string): Promise<ISettlement[]> {
    this.validateObjectId(userId, "user id");

    return this.repository.findByUserId(userId);
  }

  async getByCreator(creatorId: string): Promise<ISettlement[]> {
    this.validateObjectId(creatorId, "creator id");

    return this.repository.findByCreatorId(creatorId);
  }

  /* -------------------------------------------------------------------------- */
  /* Status                                                                      */
  /* -------------------------------------------------------------------------- */

  async updateStatus(
    settlementId: string,
    status: SettlementStatus,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      status,
    });
  }

  async markProcessing(settlementId: string): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      status: SettlementStatus.PROCESSING,
    });
  }

  async markCompleted(settlementId: string): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      status: SettlementStatus.COMPLETED,

      settledAt: new Date(),
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Failure                                                                     */
  /* -------------------------------------------------------------------------- */

  async markFailed(
    settlementId: string,
    message?: string,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      status: SettlementStatus.FAILED,

      failureMessage: message,

      attemptNumber: settlement.attemptNumber + 1,
    });
  }

  async markCancelled(settlementId: string): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      status: SettlementStatus.CANCELLED,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Provider                                                                    */
  /* -------------------------------------------------------------------------- */

  async updateProviderReferences(
    settlementId: string,
    data: {
      providerSettlementId?: string;
      providerBatchId?: string;
      providerTransactionId?: string;
    },
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      ...data,
    });
  }

  async updateProviderPayload(
    settlementId: string,
    payload: Record<string, unknown>,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      providerPayload: payload,
    });
  }

  async updateAttributes(
    settlementId: string,
    attributes: Record<string, unknown>,
    session?: mongoose.ClientSession,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId, session);

    return this.save(settlement, {
      attributes,
    }, session);
  }

  async setRetryable(
    settlementId: string,
    retryable: boolean,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, {
      retryable,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  async exists(settlementId: string): Promise<boolean> {
    this.validateObjectId(settlementId, "settlement id");

    return this.repository.exists({
      _id: new mongoose.Types.ObjectId(settlementId),
    });
  }

  async existsByReference(settlementReference: string): Promise<boolean> {
    return this.repository.exists({
      settlementReference,
    });
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ISettlement | null> {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  async verifyIntegrity(settlementId: string): Promise<boolean> {
    const settlement = await this.getSettlementDocument(settlementId);

    return (
      settlement.amount > 0 &&
      settlement.settlementReference.length > 0 &&
      settlement.currency.length > 0 &&
      settlement.idempotencyKey.length > 0
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Repository Helpers                                                  */
  /* -------------------------------------------------------------------------- */

  async findOne(filter: Record<string, unknown>): Promise<ISettlement | null> {
    return this.repository.findOne(filter);
  }

  async findMany(filter: Record<string, unknown>): Promise<ISettlement[]> {
    return this.repository.findMany(filter);
  }

  async update(
    settlementId: string,
    update: Record<string, unknown>,
  ): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    return this.save(settlement, update);
  }

  async deleteSettlement(settlementId: string): Promise<ISettlement> {
    const settlement = await this.getSettlementDocument(settlementId);

    const deleted = await this.repository.deleteById(settlement._id.toString());

    if (!deleted) {
      throw new SettlementError("Failed to delete settlement.");
    }

    return deleted;
  }
}

export const settlementService = new SettlementService();
