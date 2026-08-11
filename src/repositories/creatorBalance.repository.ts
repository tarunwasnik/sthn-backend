// backend/src/repositories/creatorBalance.repository.ts

import {
  CreatorBalance,
  ICreatorBalance,
} from "../models/creatorBalance.model";
import { ClientSession } from "mongoose";

export class CreatorBalanceRepository {
  async create(
    data: Partial<ICreatorBalance>,
    session?: ClientSession,
  ): Promise<ICreatorBalance> {
    if (!session) {
      return CreatorBalance.create(data);
    }

    const [balance] = await CreatorBalance.create([data], { session });

    return balance;
  }

  async findById(id: string): Promise<ICreatorBalance | null> {
    return CreatorBalance.findById(id).exec();
  }

  async findByCreatorId(
    creatorId: string,
    session?: ClientSession,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOne({
      creatorId,
    })
      .session(session ?? null)
      .exec();
  }

  async findOne(
    filter: Record<string, unknown>,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOne(filter).exec();
  }

  async findMany(filter: Record<string, unknown>): Promise<ICreatorBalance[]> {
    return CreatorBalance.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateById(
    id: string,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
      session,
    }).exec();
  }

  async reserveAvailableBalance(
    creatorId: string,
    currency: string,
    amount: number,
    session?: ClientSession,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOneAndUpdate(
      {
        creatorId,
        currency,
        availableBalance: { $gte: amount },
      },
      {
        $inc: {
          availableBalance: -amount,
          reservedBalance: amount,
        },
        $set: {
          lastCalculatedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      },
    ).exec();
  }

  async consumeReservedBalance(
    creatorId: string,
    currency: string,
    amount: number,
    session?: ClientSession,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOneAndUpdate(
      { creatorId, currency, reservedBalance: { $gte: amount } },
      {
        $inc: { reservedBalance: -amount },
        $set: { lastCalculatedAt: new Date() },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async releaseReservedBalance(
    creatorId: string,
    currency: string,
    amount: number,
    session?: ClientSession,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOneAndUpdate(
      { creatorId, currency, reservedBalance: { $gte: amount } },
      {
        $inc: {
          reservedBalance: -amount,
          availableBalance: amount,
        },
        $set: { lastCalculatedAt: new Date() },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    }).exec();
  }
  async creditAvailableForSettlement(creatorId: string, currency: string, amount: number, session: ClientSession): Promise<ICreatorBalance | null> {
    return CreatorBalance.findOneAndUpdate({ creatorId, currency }, { $inc: { availableBalance: amount, lifetimeNet: amount }, $set: { lastCalculatedAt: new Date() } }, { new: true, runValidators: true, session }).exec();
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const result = await CreatorBalance.exists(filter);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return CreatorBalance.countDocuments(filter).exec();
  }

  async deleteById(id: string): Promise<ICreatorBalance | null> {
    return CreatorBalance.findByIdAndDelete(id).exec();
  }
}

export const creatorBalanceRepository = new CreatorBalanceRepository();
