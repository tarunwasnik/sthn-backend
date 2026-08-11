import { ClientSession, Types, UpdateQuery } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletError } from "../../errors/financial/WalletError";
import { Wallet, WalletDocument } from "../../models/wallet.model";

export interface WalletMinimums {
  availableBalance?: number;
  reservedBalance?: number;
  lockedBalance?: number;
}

export class WalletRepository {
  async findById(walletId: Types.ObjectId, session?: ClientSession): Promise<WalletDocument | null> {
    return Wallet.findById(walletId).session(session ?? null);
  }

  async findByUserAndCurrency(
    userId: Types.ObjectId,
    currency: SupportedCurrency,
    session?: ClientSession,
  ): Promise<WalletDocument | null> {
    const wallets = await Wallet.find({ userId, currency })
      .limit(2)
      .session(session ?? null)
      .exec();
    if (wallets.length > 1) {
      throw new WalletError(
        "Multiple Wallets exist for the same ownership identity.",
        "WALLET_DUPLICATE_OWNERSHIP",
      );
    }
    return wallets[0] ?? null;
  }

  async findAllByUser(userId: Types.ObjectId): Promise<WalletDocument[]> {
    return Wallet.find({ userId }).sort({ currency: 1 }).exec();
  }

  async findAnyByUser(
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<WalletDocument | null> {
    return Wallet.findOne({ userId }).session(session ?? null).exec();
  }

  async exists(userId: Types.ObjectId, currency: SupportedCurrency): Promise<boolean> {
    return (await Wallet.exists({ userId, currency })) !== null;
  }

  async createZeroBalance(
    userId: Types.ObjectId,
    currency: SupportedCurrency,
    session?: ClientSession,
  ): Promise<WalletDocument> {
    const data = { userId, currency };
    if (!session) return Wallet.create(data);
    const [wallet] = await Wallet.create([data], { session });
    return wallet;
  }

  async applyConditionalDelta(
    walletId: Types.ObjectId,
    minimums: WalletMinimums,
    maximums: WalletMinimums,
    maximumCurrentBalance: number | undefined,
    update: UpdateQuery<WalletDocument>,
    session: ClientSession,
  ): Promise<WalletDocument | null> {
    const filter: Record<string, unknown> = {
      _id: walletId,
      $expr: {
        $eq: [
          "$currentBalance",
          { $add: ["$availableBalance", "$reservedBalance", "$lockedBalance"] },
        ],
      },
    };
    for (const field of ["availableBalance", "reservedBalance", "lockedBalance"] as const) {
      const minimum = minimums[field];
      const maximum = maximums[field];
      if (minimum !== undefined || maximum !== undefined) {
        filter[field] = {
          ...(minimum !== undefined ? { $gte: minimum } : {}),
          ...(maximum !== undefined ? { $lte: maximum } : {}),
        };
      }
    }
    if (maximumCurrentBalance !== undefined) filter.currentBalance = { $lte: maximumCurrentBalance };
    return Wallet.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      session,
    });
  }

  async markSynchronized(
    walletId: Types.ObjectId,
    at: Date,
    session?: ClientSession,
  ): Promise<WalletDocument | null> {
    return Wallet.findByIdAndUpdate(walletId, { lastSyncedAt: at }, {
      new: true,
      runValidators: true,
      session,
    });
  }
}

export const walletRepository = new WalletRepository();
