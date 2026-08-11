// backend/src/services/financial/creatorBalance.service.ts

import mongoose from "mongoose";

import { ICreatorBalance } from "../../models/creatorBalance.model";

import { creatorBalanceRepository } from "../../repositories/creatorBalance.repository";

import { createMoney, isValidMoney } from "../../utils/financial/money.util";

import { Money } from "../../types/financial/money.type";

import { BalanceError } from "../../errors/financial/BalanceError";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

export interface CreateCreatorBalanceInput {
  creatorId: string;
  currency: SupportedCurrency;
}

export interface BalanceAdjustmentInput {
  creatorId: string;
  money: Money;
}

export interface BalanceTransferInput {
  creatorId: string;

  from: keyof Pick<
    ICreatorBalance,
    | "pendingBalance"
    | "availableBalance"
    | "lockedBalance"
    | "payoutPendingBalance"
  >;

  to: keyof Pick<
    ICreatorBalance,
    | "pendingBalance"
    | "availableBalance"
    | "lockedBalance"
    | "payoutPendingBalance"
  >;

  money: Money;
}

export class CreatorBalanceService {
  constructor(private readonly repository = creatorBalanceRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private validateCreatorId(creatorId: string): void {
    if (!mongoose.Types.ObjectId.isValid(creatorId)) {
      throw new BalanceError("Invalid creator id.");
    }
  }

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new BalanceError("Invalid money.");
    }
  }

  private ensureCurrency(balance: ICreatorBalance, money: Money): void {
    if (balance.currency !== money.currency) {
      throw new BalanceError("Currency mismatch.");
    }
  }

  private async getBalanceDocument(
    creatorId: string,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    this.validateCreatorId(creatorId);

    const balance = await this.repository.findByCreatorId(creatorId, session);

    if (!balance) {
      throw new BalanceError("Creator balance not found.");
    }

    return balance;
  }

  private async save(
    balance: ICreatorBalance,
    update: Record<string, unknown>,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    const updated = await this.repository.updateById(
      balance._id.toString(),
      update,
      session,
    );

    if (!updated) {
      throw new BalanceError("Failed to update creator balance.");
    }

    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* Creation                                                                    */
  /* -------------------------------------------------------------------------- */

  async createBalance(
    input: CreateCreatorBalanceInput,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    this.validateCreatorId(input.creatorId);

    const existing = await this.repository.findByCreatorId(
      input.creatorId,
      session,
    );

    if (existing) {
      return existing;
    }

    return this.repository.create(
      {
        creatorId: new mongoose.Types.ObjectId(input.creatorId),

        currency: input.currency,

        pendingBalance: 0,

        availableBalance: 0,

        lockedBalance: 0,
        reservedBalance: 0,

        payoutPendingBalance: 0,

        lifetimeGross: 0,

        lifetimeNet: 0,

        lifetimeCommission: 0,

        lifetimeRefunded: 0,

        lifetimePaidOut: 0,

        lastCalculatedAt: new Date(),
      },
      session,
    );
  }

  async getBalance(creatorId: string): Promise<ICreatorBalance> {
    return this.getBalanceDocument(creatorId);
  }
  /* -------------------------------------------------------------------------- */
  /* Read Helpers                                                                */
  /* -------------------------------------------------------------------------- */

  async getPendingBalance(creatorId: string): Promise<Money> {
    const balance = await this.getBalanceDocument(creatorId);

    return createMoney(balance.pendingBalance, balance.currency);
  }

  async getAvailableBalance(creatorId: string): Promise<Money> {
    const balance = await this.getBalanceDocument(creatorId);

    return createMoney(balance.availableBalance, balance.currency);
  }

  async getLockedBalance(creatorId: string): Promise<Money> {
    const balance = await this.getBalanceDocument(creatorId);

    return createMoney(balance.lockedBalance, balance.currency);
  }

  async getPayoutPendingBalance(creatorId: string): Promise<Money> {
    const balance = await this.getBalanceDocument(creatorId);

    return createMoney(balance.payoutPendingBalance, balance.currency);
  }

  /* -------------------------------------------------------------------------- */
  /* Pending Balance                                                             */
  /* -------------------------------------------------------------------------- */

  async increasePendingBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    return this.save(balance, {
      pendingBalance: balance.pendingBalance + input.money.amount,

      lifetimeGross: balance.lifetimeGross + input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async decreasePendingBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    if (balance.pendingBalance < input.money.amount) {
      throw new BalanceError("Insufficient pending balance.");
    }

    return this.save(balance, {
      pendingBalance: balance.pendingBalance - input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Available Balance                                                           */
  /* -------------------------------------------------------------------------- */

  async increaseAvailableBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    return this.save(balance, {
      availableBalance: balance.availableBalance + input.money.amount,

      lifetimeNet: balance.lifetimeNet + input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async decreaseAvailableBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    if (balance.availableBalance < input.money.amount) {
      throw new BalanceError("Insufficient available balance.");
    }

    return this.save(balance, {
      availableBalance: balance.availableBalance - input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Locked Balance                                                              */
  /* -------------------------------------------------------------------------- */

  async increaseLockedBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    return this.save(balance, {
      lockedBalance: balance.lockedBalance + input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async decreaseLockedBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    if (balance.lockedBalance < input.money.amount) {
      throw new BalanceError("Insufficient locked balance.");
    }

    return this.save(balance, {
      lockedBalance: balance.lockedBalance - input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Payout Pending Balance                                                      */
  /* -------------------------------------------------------------------------- */

  async increasePayoutPendingBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    return this.save(balance, {
      payoutPendingBalance: balance.payoutPendingBalance + input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async decreasePayoutPendingBalance(
    input: BalanceAdjustmentInput,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    if (balance.payoutPendingBalance < input.money.amount) {
      throw new BalanceError("Insufficient payout pending balance.");
    }

    return this.save(balance, {
      payoutPendingBalance: balance.payoutPendingBalance - input.money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Lifetime Counters                                                           */
  /* -------------------------------------------------------------------------- */

  async increaseLifetimeCommission(
    creatorId: string,
    money: Money,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    this.validateMoney(money);
    this.ensureCurrency(balance, money);

    return this.save(balance, {
      lifetimeCommission: balance.lifetimeCommission + money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async increaseLifetimeRefunded(
    creatorId: string,
    money: Money,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    this.validateMoney(money);
    this.ensureCurrency(balance, money);

    return this.save(balance, {
      lifetimeRefunded: balance.lifetimeRefunded + money.amount,

      lastCalculatedAt: new Date(),
    });
  }

  async increaseLifetimePaidOut(
    creatorId: string,
    money: Money,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    this.validateMoney(money);
    this.ensureCurrency(balance, money);

    return this.save(balance, {
      lifetimePaidOut: balance.lifetimePaidOut + money.amount,

      lastCalculatedAt: new Date(),
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Transfers                                                                   */
  /* -------------------------------------------------------------------------- */

  async transferBalance(
    input: BalanceTransferInput,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(input.creatorId, session);

    this.validateMoney(input.money);
    this.ensureCurrency(balance, input.money);

    const fromValue = balance[input.from] as number;

    if (fromValue < input.money.amount) {
      throw new BalanceError(`Insufficient ${input.from}.`);
    }

    return this.save(balance, {
      [input.from]: fromValue - input.money.amount,

      [input.to]: (balance[input.to] as number) + input.money.amount,

      lastCalculatedAt: new Date(),
    }, session);
  }

  async reserveAvailableBalance(
    input: BalanceAdjustmentInput,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    this.validateCreatorId(input.creatorId);
    this.validateMoney(input.money);

    const balance = await this.getBalanceDocument(input.creatorId, session);

    this.ensureCurrency(balance, input.money);

    const reserved = await this.repository.reserveAvailableBalance(
      input.creatorId,
      input.money.currency,
      input.money.amount,
      session,
    );

    if (!reserved) {
      throw new BalanceError("Insufficient available balance.");
    }

    return reserved;
  }

  async consumeReservedBalance(
    input: BalanceAdjustmentInput,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    this.validateCreatorId(input.creatorId);
    this.validateMoney(input.money);

    const balance = await this.getBalanceDocument(input.creatorId, session);
    this.ensureCurrency(balance, input.money);

    const updated = await this.repository.consumeReservedBalance(
      input.creatorId,
      input.money.currency,
      input.money.amount,
      session,
    );

    if (!updated) {
      throw new BalanceError("Insufficient locked balance.");
    }

    return updated;
  }

  async releaseReservedBalance(
    input: BalanceAdjustmentInput,
    session?: mongoose.ClientSession,
  ): Promise<ICreatorBalance> {
    this.validateCreatorId(input.creatorId);
    this.validateMoney(input.money);

    const balance = await this.getBalanceDocument(input.creatorId, session);
    this.ensureCurrency(balance, input.money);

    const updated = await this.repository.releaseReservedBalance(
      input.creatorId,
      input.money.currency,
      input.money.amount,
      session,
    );

    if (!updated) {
      throw new BalanceError("Insufficient locked balance.");
    }

    return updated;
  }

  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  async hasBalance(creatorId: string): Promise<boolean> {
    this.validateCreatorId(creatorId);

    return this.repository.exists({
      creatorId: new mongoose.Types.ObjectId(creatorId),
    });
  }

  async verifyIntegrity(creatorId: string): Promise<boolean> {
    const balance = await this.getBalanceDocument(creatorId);

    return [
      balance.pendingBalance,
      balance.availableBalance,
      balance.lockedBalance,
      balance.payoutPendingBalance,
      balance.lifetimeGross,
      balance.lifetimeNet,
      balance.lifetimeCommission,
      balance.lifetimeRefunded,
      balance.lifetimePaidOut,
    ].every((value) => Number.isFinite(value) && value >= 0);
  }

  /* -------------------------------------------------------------------------- */
  /* Reset                                                                       */
  /* -------------------------------------------------------------------------- */

  async resetBalances(creatorId: string): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    return this.save(balance, {
      pendingBalance: 0,

      availableBalance: 0,

      lockedBalance: 0,

      payoutPendingBalance: 0,

      lastCalculatedAt: new Date(),
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Repository Helpers                                                  */
  /* -------------------------------------------------------------------------- */

  async findOne(
    filter: Record<string, unknown>,
  ): Promise<ICreatorBalance | null> {
    return this.repository.findOne(filter);
  }

  async update(
    creatorId: string,
    update: Record<string, unknown>,
  ): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    return this.save(balance, update);
  }

  async deleteBalance(creatorId: string): Promise<ICreatorBalance> {
    const balance = await this.getBalanceDocument(creatorId);

    const deleted = await this.repository.deleteById(balance._id.toString());

    if (!deleted) {
      throw new BalanceError("Failed to delete creator balance.");
    }

    return deleted;
  }
}

export const creatorBalanceService = new CreatorBalanceService();
