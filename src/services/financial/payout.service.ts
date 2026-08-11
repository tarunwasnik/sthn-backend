// backend/src/services/financial/payout.service.ts

import mongoose from "mongoose";

import { IPayout } from "../../models/payout.model";

import { payoutRepository } from "../../repositories/payout.repository";

import { Money } from "../../types/financial/money.type";

import { isValidMoney } from "../../utils/financial/money.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

import { generateIdempotencyKey } from "../../utils/financial/idempotency.util";

import { PayoutError } from "../../errors/financial/PayoutError";

import { PayoutStatus } from "../../enums/financial/payoutStatus.enum";
import { PayoutSourceType } from "../../enums/financial/payoutSourceType.enum";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

export interface CreatePayoutInput {
  creatorId: string;

  settlementId: string;

  bookingId: string;

  paymentId: string;

  amount: Money;

  provider?: PaymentProvider;

  providerPayoutId?: string;

  providerTransferId?: string;

  beneficiaryId?: string;

  idempotencyKey?: string;

  providerPayload?: Record<string, unknown>;

  attributes?: Record<string, unknown>;
}

export interface CreateWithdrawalPayoutInput {
  withdrawalId: string;
  creatorId: string;
  amount: Money;
  idempotencyKey: string;
}

export class PayoutService {
  constructor(private readonly repository = payoutRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private validateObjectId(value: string, field: string): void {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new PayoutError(`Invalid ${field}.`);
    }
  }

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new PayoutError("Invalid payout amount.");
    }
  }

  private async getPayoutDocument(payoutId: string): Promise<IPayout> {
    this.validateObjectId(payoutId, "payout id");

    const payout = await this.repository.findById(payoutId);

    if (!payout) {
      throw new PayoutError("Payout not found.");
    }

    return payout;
  }

  private async save(
    payout: IPayout,
    update: Record<string, unknown>,
  ): Promise<IPayout> {
    const updated = await this.repository.updateById(
      payout._id.toString(),
      update,
    );

    if (!updated) {
      throw new PayoutError("Failed to update payout.");
    }

    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* Creation                                                                    */
  /* -------------------------------------------------------------------------- */

  async createPayout(input: CreatePayoutInput): Promise<IPayout> {
    this.validateObjectId(input.creatorId, "creator id");

    this.validateObjectId(input.settlementId, "settlement id");

    this.validateObjectId(input.bookingId, "booking id");

    this.validateObjectId(input.paymentId, "payment id");

    this.validateMoney(input.amount);

    return this.repository.create({
      payoutReference: generateFinancialReference("PAYOUT"),

      creatorId: new mongoose.Types.ObjectId(input.creatorId),

      settlementId: new mongoose.Types.ObjectId(input.settlementId),

      bookingId: new mongoose.Types.ObjectId(input.bookingId),

      paymentId: new mongoose.Types.ObjectId(input.paymentId),

      amount: input.amount.amount,

      currency: input.amount.currency,

      status: PayoutStatus.CREATED,

      provider: input.provider ?? PaymentProvider.INTERNAL,

      providerPayoutId: input.providerPayoutId,

      providerTransferId: input.providerTransferId,

      beneficiaryId: input.beneficiaryId,

      attemptNumber: 1,

      retryable: true,

      idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),

      providerPayload: input.providerPayload ?? {},

      attributes: input.attributes ?? {},

      initiatedAt: new Date(),
    });
  }

  async createWithdrawalPayout(
    input: CreateWithdrawalPayoutInput,
    session?: mongoose.ClientSession,
  ): Promise<IPayout> {
    this.validateObjectId(input.withdrawalId, "withdrawal id");
    this.validateObjectId(input.creatorId, "creator id");
    this.validateMoney(input.amount);

    return this.repository.create(
      {
        payoutReference: generateFinancialReference("PAYOUT"),
        sourceType: PayoutSourceType.WITHDRAWAL,
        withdrawalId: new mongoose.Types.ObjectId(input.withdrawalId),
        creatorId: new mongoose.Types.ObjectId(input.creatorId),
        amount: input.amount.amount,
        currency: input.amount.currency,
        status: PayoutStatus.CREATED,
        provider: PaymentProvider.INTERNAL,
        attemptNumber: 1,
        retryable: true,
        idempotencyKey: input.idempotencyKey,
        providerPayload: {},
        attributes: {},
        initiatedAt: new Date(),
      },
      session,
    );
  }

  async getByWithdrawal(
    withdrawalId: string,
    session?: mongoose.ClientSession,
  ): Promise<IPayout | null> {
    this.validateObjectId(withdrawalId, "withdrawal id");

    return this.repository.findByWithdrawalId(withdrawalId, session);
  }
  /* -------------------------------------------------------------------------- */
  /* Reads                                                                       */
  /* -------------------------------------------------------------------------- */

  async getPayout(payoutId: string): Promise<IPayout> {
    return this.getPayoutDocument(payoutId);
  }

  async getByReference(payoutReference: string): Promise<IPayout> {
    const payout = await this.repository.findByPayoutReference(payoutReference);

    if (!payout) {
      throw new PayoutError("Payout not found.");
    }

    return payout;
  }

  async getByCreator(creatorId: string): Promise<IPayout[]> {
    this.validateObjectId(creatorId, "creator id");

    return this.repository.findByCreatorId(creatorId);
  }

  async getBySettlement(settlementId: string): Promise<IPayout[]> {
    this.validateObjectId(settlementId, "settlement id");

    return this.repository.findBySettlementId(settlementId);
  }

  async getByBooking(bookingId: string): Promise<IPayout[]> {
    this.validateObjectId(bookingId, "booking id");

    return this.repository.findByBookingId(bookingId);
  }

  async getByPayment(paymentId: string): Promise<IPayout[]> {
    this.validateObjectId(paymentId, "payment id");

    return this.repository.findByPaymentId(paymentId);
  }

  /* -------------------------------------------------------------------------- */
  /* Status                                                                      */
  /* -------------------------------------------------------------------------- */

  async updateStatus(payoutId: string, status: PayoutStatus): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      status,
    });
  }

  async markProcessing(payoutId: string): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      status: PayoutStatus.PROCESSING,
    });
  }

  async markCompleted(payoutId: string): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      status: PayoutStatus.COMPLETED,

      completedAt: new Date(),
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Failure                                                                     */
  /* -------------------------------------------------------------------------- */

  async markFailed(payoutId: string, message?: string): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      status: PayoutStatus.FAILED,

      failureMessage: message,

      attemptNumber: payout.attemptNumber + 1,
    });
  }

  async markCancelled(payoutId: string): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      status: PayoutStatus.CANCELLED,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Provider                                                                    */
  /* -------------------------------------------------------------------------- */

  async updateProviderReferences(
    payoutId: string,
    data: {
      providerPayoutId?: string;
      providerTransferId?: string;
      beneficiaryId?: string;
    },
  ): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      ...data,
    });
  }

  async updateProviderPayload(
    payoutId: string,
    payload: Record<string, unknown>,
  ): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      providerPayload: payload,
    });
  }

  async updateAttributes(
    payoutId: string,
    attributes: Record<string, unknown>,
  ): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      attributes,
    });
  }

  async setRetryable(payoutId: string, retryable: boolean): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, {
      retryable,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  async exists(payoutId: string): Promise<boolean> {
    this.validateObjectId(payoutId, "payout id");

    return this.repository.exists({
      _id: new mongoose.Types.ObjectId(payoutId),
    });
  }

  async existsByReference(payoutReference: string): Promise<boolean> {
    return this.repository.exists({
      payoutReference,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IPayout | null> {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  async verifyIntegrity(payoutId: string): Promise<boolean> {
    const payout = await this.getPayoutDocument(payoutId);

    return (
      payout.amount > 0 &&
      payout.payoutReference.length > 0 &&
      payout.currency.length > 0 &&
      payout.idempotencyKey.length > 0
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Repository Helpers                                                  */
  /* -------------------------------------------------------------------------- */

  async findOne(filter: Record<string, unknown>): Promise<IPayout | null> {
    return this.repository.findOne(filter);
  }

  async findMany(filter: Record<string, unknown>): Promise<IPayout[]> {
    return this.repository.findMany(filter);
  }

  async update(
    payoutId: string,
    update: Record<string, unknown>,
  ): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    return this.save(payout, update);
  }

  async deletePayout(payoutId: string): Promise<IPayout> {
    const payout = await this.getPayoutDocument(payoutId);

    const deleted = await this.repository.deleteById(payout._id.toString());

    if (!deleted) {
      throw new PayoutError("Failed to delete payout.");
    }

    return deleted;
  }
}

export const payoutService = new PayoutService();
