// backend/src/repositories/ledgerEntry.repository.ts

import { Types } from "mongoose";
import { ClientSession } from "mongoose";

import { ILedgerEntry, LedgerEntry } from "../models/ledgerEntry.model";

export class LedgerEntryRepository {
  async findByPostingKey(
    postingKey: string,
    session?: ClientSession,
  ): Promise<ILedgerEntry | null> {
    return LedgerEntry.findOne({ postingKey }).session(session ?? null).exec();
  }
  async create(
    data: Partial<ILedgerEntry>,
    session?: ClientSession,
  ): Promise<ILedgerEntry> {
    if (!session) {
      return LedgerEntry.create(data);
    }

    const [entry] = await LedgerEntry.create([data], { session });

    return entry;
  }

  async createMany(entries: Partial<ILedgerEntry>[]): Promise<ILedgerEntry[]> {
    const created = await LedgerEntry.insertMany(entries);

    return created as ILedgerEntry[];
  }

  async findById(id: string | Types.ObjectId): Promise<ILedgerEntry | null> {
    return LedgerEntry.findById(id).exec();
  }

  async findByLedgerReference(
    ledgerReference: string,
  ): Promise<ILedgerEntry | null> {
    return LedgerEntry.findOne({ ledgerReference }).exec();
  }

  async findByBookingId(
    bookingId: string | Types.ObjectId,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findByPaymentId(
    paymentId: string | Types.ObjectId,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ paymentId }).sort({ createdAt: -1 }).exec();
  }

  async findByRefundId(
    refundId: string | Types.ObjectId,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ refundId }).sort({ createdAt: -1 }).exec();
  }

  async findBySettlementId(
    settlementId: string | Types.ObjectId,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ settlementId }).sort({ createdAt: -1 }).exec();
  }

  async findByPayoutId(
    payoutId: string | Types.ObjectId,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ payoutId }).sort({ createdAt: -1 }).exec();
  }

  async findByUserId(userId: string | Types.ObjectId): Promise<ILedgerEntry[]> {
    return LedgerEntry.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<ILedgerEntry | null> {
    return LedgerEntry.findOne(filter).exec();
  }

  async findMany(
    filter: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find(filter).sort({ createdAt: -1 })
      .session(session ?? null).exec();
  }

  async findManyWithPostingKeys(
    filter: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ILedgerEntry[]> {
    return LedgerEntry.find(filter).select("+postingKey").sort({ createdAt: -1 })
      .session(session ?? null).exec();
  }

  async updateById(
    id: string | Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<ILedgerEntry | null> {
    return LedgerEntry.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<ILedgerEntry | null> {
    return LedgerEntry.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async exists(
    filter: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<boolean> {
    const result = await LedgerEntry.exists(filter).session(session ?? null);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return LedgerEntry.countDocuments(filter).exec();
  }
}

export const ledgerEntryRepository = new LedgerEntryRepository();
