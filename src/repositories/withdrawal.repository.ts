import { ClientSession } from "mongoose";

import { IWithdrawal, Withdrawal } from "../models/withdrawal.model";

export class WithdrawalRepository {
  async create(
    data: Partial<IWithdrawal>,
    session?: ClientSession,
  ): Promise<IWithdrawal> {
    if (!session) {
      return Withdrawal.create(data);
    }

    const [withdrawal] = await Withdrawal.create([data], { session });

    return withdrawal;
  }

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<IWithdrawal | null> {
    return Withdrawal.findById(id).session(session ?? null).exec();
  }

  async findByIdForPayoutExecution(id: string): Promise<IWithdrawal | null> {
    return Withdrawal.findById(id)
      .select(
        "_id withdrawalReference creatorId status payoutId payoutDestinationId destinationSnapshot +destinationSnapshot.encryptedPayload",
      )
      .exec();
  }

  async findByReference(
    withdrawalReference: string,
  ): Promise<IWithdrawal | null> {
    return Withdrawal.findOne({ withdrawalReference }).exec();
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<IWithdrawal | null> {
    return Withdrawal.findOne({ idempotencyKey })
      .session(session ?? null)
      .exec();
  }

  async findActiveByCreator(creatorId: string, session?: ClientSession): Promise<IWithdrawal | null> {
    return Withdrawal.findOne({ creatorId, isActiveObligation: true }).session(session ?? null).exec();
  }
  async findByReferenceForCreator(withdrawalReference: string, creatorId: string): Promise<IWithdrawal | null> { return Withdrawal.findOne({ withdrawalReference, creatorId }).exec(); }
  async listByCreator(creatorId: string, page: number, limit: number, status?: string): Promise<IWithdrawal[]> { return Withdrawal.find({ creatorId, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).exec(); }

  async updateById(
    id: string,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IWithdrawal | null> {
    return Withdrawal.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
      session,
    }).exec();
  }
}

export const withdrawalRepository = new WithdrawalRepository();
