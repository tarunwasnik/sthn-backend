// backend/src/repositories/settlement.repository.ts

import { ISettlement, Settlement } from "../models/settlement.model";
import { ClientSession } from "mongoose";

export class SettlementRepository {
  async create(data: Partial<ISettlement>, session?: ClientSession): Promise<ISettlement> {
    if (!session) return Settlement.create(data);
    return new Settlement(data).save({ session });
  }

  async findById(id: string): Promise<ISettlement | null> {
    return Settlement.findById(id).exec();
  }

  async findBySettlementReference(
    settlementReference: string,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({ settlementReference }).exec();
  }

  async findByBookingId(bookingId: string): Promise<ISettlement[]> {
    return Settlement.find({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findByPaymentId(
    paymentId: string,
    session?: ClientSession,
  ): Promise<ISettlement[]> {
    return Settlement.find({ paymentId })
      .sort({ createdAt: -1 })
      .session(session ?? null)
      .exec();
  }

  async findByUserId(userId: string): Promise<ISettlement[]> {
    return Settlement.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findByCreatorId(creatorId: string): Promise<ISettlement[]> {
    return Settlement.find({ creatorId }).sort({ createdAt: -1 }).exec();
  }

  async findByProviderSettlementId(
    providerSettlementId: string,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({
      providerSettlementId,
    }).exec();
  }

  async findByProviderBatchId(
    providerBatchId: string,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({
      providerBatchId,
    }).exec();
  }

  async findByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({
      providerTransactionId,
    }).exec();
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({
      idempotencyKey,
    }).exec();
  }

  async findByFinancialObligationKey(
    financialObligationKey: string,
    session?: ClientSession,
  ): Promise<ISettlement | null> {
    return Settlement.findOne({ financialObligationKey }).session(session ?? null).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<ISettlement | null> {
    return Settlement.findOne(filter).exec();
  }

  async findMany(filter: Record<string, unknown>): Promise<ISettlement[]> {
    return Settlement.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateById(
    id: string,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ISettlement | null> {
    return Settlement.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
      session,
    }).exec();
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<ISettlement | null> {
    return Settlement.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const result = await Settlement.exists(filter);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return Settlement.countDocuments(filter).exec();
  }

  async deleteById(id: string): Promise<ISettlement | null> {
    return Settlement.findByIdAndDelete(id).exec();
  }
}

export const settlementRepository = new SettlementRepository();
