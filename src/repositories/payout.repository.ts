// backend/src/repositories/payout.repository.ts

import { IPayout, Payout } from "../models/payout.model";
import { ClientSession } from "mongoose";

export class PayoutRepository {
  async create(
    data: Partial<IPayout>,
    session?: ClientSession,
  ): Promise<IPayout> {
    if (!session) {
      return Payout.create(data);
    }

    const [payout] = await Payout.create([data], { session });

    return payout;
  }

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<IPayout | null> {
    return Payout.findById(id).session(session ?? null).exec();
  }

  async findByPayoutReference(
    payoutReference: string,
  ): Promise<IPayout | null> {
    return Payout.findOne({ payoutReference }).exec();
  }

  async findByCreatorId(creatorId: string): Promise<IPayout[]> {
    return Payout.find({ creatorId }).sort({ createdAt: -1 }).exec();
  }

  async findBySettlementId(settlementId: string): Promise<IPayout[]> {
    return Payout.find({ settlementId }).sort({ createdAt: -1 }).exec();
  }

  async findByBookingId(bookingId: string): Promise<IPayout[]> {
    return Payout.find({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findByPaymentId(paymentId: string): Promise<IPayout[]> {
    return Payout.find({ paymentId }).sort({ createdAt: -1 }).exec();
  }

  async findByWithdrawalId(
    withdrawalId: string,
    session?: ClientSession,
  ): Promise<IPayout | null> {
    return Payout.findOne({ withdrawalId })
      .session(session ?? null)
      .exec();
  }

  async findByProviderPayoutId(
    providerPayoutId: string,
  ): Promise<IPayout | null> {
    return Payout.findOne({
      providerPayoutId,
    }).exec();
  }

  async findByProviderTransferId(
    providerTransferId: string,
  ): Promise<IPayout | null> {
    return Payout.findOne({
      providerTransferId,
    }).exec();
  }

  async findByBeneficiaryId(beneficiaryId: string): Promise<IPayout | null> {
    return Payout.findOne({
      beneficiaryId,
    }).exec();
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IPayout | null> {
    return Payout.findOne({
      idempotencyKey,
    }).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<IPayout | null> {
    return Payout.findOne(filter).exec();
  }

  async findMany(filter: Record<string, unknown>): Promise<IPayout[]> {
    return Payout.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateById(
    id: string,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPayout | null> {
    return Payout.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
      session,
    }).exec();
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<IPayout | null> {
    return Payout.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const result = await Payout.exists(filter);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return Payout.countDocuments(filter).exec();
  }

  async deleteById(id: string): Promise<IPayout | null> {
    return Payout.findByIdAndDelete(id).exec();
  }
}

export const payoutRepository = new PayoutRepository();
