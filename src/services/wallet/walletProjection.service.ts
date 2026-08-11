import crypto from "crypto";
import mongoose, { ClientSession, Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletDocument } from "../../models/wallet.model";
import { WalletError } from "../../errors/financial/WalletError";
import { walletRepository, WalletMinimums } from "../../repositories/wallet/wallet.repository";
import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { normalizeWalletCurrency } from "./walletCreation.service";

export interface WalletProjectionDeltas {
  availableBalance?: number;
  reservedBalance?: number;
  lockedBalance?: number;
}

export interface ApplyWalletProjectionInput {
  userId: Types.ObjectId;
  currency: SupportedCurrency;
  operationKey: string;
  deltas: WalletProjectionDeltas;
  minimums?: WalletMinimums;
  ledgerEntryIds?: Types.ObjectId[];
}

export class WalletProjectionService {
  private normalizedDeltas(deltas: WalletProjectionDeltas) {
    const values = {
      availableBalance: deltas.availableBalance ?? 0,
      reservedBalance: deltas.reservedBalance ?? 0,
      lockedBalance: deltas.lockedBalance ?? 0,
    };
    if (Object.values(values).every((value) => value === 0) || !Object.values(values).every(Number.isSafeInteger)) {
      throw new WalletError("Wallet projection deltas must include a non-zero safe integer minor-unit value.", "WALLET_INVALID_MINOR_UNIT");
    }
    return values;
  }

  private normalizedMinimums(deltas: Required<WalletProjectionDeltas>, providedMinimums: WalletMinimums): WalletMinimums {
    return {
      availableBalance: Math.max(providedMinimums.availableBalance ?? 0, -deltas.availableBalance, 0),
      reservedBalance: Math.max(providedMinimums.reservedBalance ?? 0, -deltas.reservedBalance, 0),
      lockedBalance: Math.max(providedMinimums.lockedBalance ?? 0, -deltas.lockedBalance, 0),
    };
  }

  private maximums(deltas: Required<WalletProjectionDeltas>): WalletMinimums {
    return {
      availableBalance: deltas.availableBalance > 0 ? FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.availableBalance : undefined,
      reservedBalance: deltas.reservedBalance > 0 ? FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.reservedBalance : undefined,
      lockedBalance: deltas.lockedBalance > 0 ? FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.lockedBalance : undefined,
    };
  }

  private normalizedLedgerEntryIds(ids: Types.ObjectId[] | undefined): Types.ObjectId[] {
    const normalized = (ids ?? []).slice().sort((a, b) => a.toString().localeCompare(b.toString()));
    if (new Set(normalized.map((id) => id.toString())).size !== normalized.length) {
      throw new WalletError("Wallet projection Ledger entry identifiers must be unique.", "WALLET_INVALID_LEDGER_ENTRIES");
    }
    return normalized;
  }

  private fingerprint(input: ApplyWalletProjectionInput, currency: SupportedCurrency, deltas: Required<WalletProjectionDeltas>, minimums: WalletMinimums, ledgerEntryIds: Types.ObjectId[]): string {
    const canonical = [
      input.userId.toString(), currency, input.operationKey.trim(),
      deltas.availableBalance, deltas.reservedBalance, deltas.lockedBalance,
      minimums.availableBalance ?? "", minimums.reservedBalance ?? "", minimums.lockedBalance ?? "",
      ledgerEntryIds.map((id) => id.toString()).join(","),
    ].join("|");
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  private validateMinimums(minimums: WalletMinimums): void {
    if (!Object.values(minimums).every((value) => value === undefined || Number.isSafeInteger(value) && value >= 0)) {
      throw new WalletError("Wallet balance minimums must be non-negative safe integer minor units.", "WALLET_INVALID_MINOR_UNIT");
    }
  }

  private async replayOrConflict(
    operationKey: string,
    fingerprint: string,
    session?: ClientSession,
  ): Promise<WalletDocument | null> {
    const existing = await walletProjectionOperationRepository.findByOperationKey(operationKey, session);
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
      throw new WalletError("Wallet projection operation key conflicts with a different payload.", "WALLET_PROJECTION_REPLAY_CONFLICT");
    }
    const wallet = await walletRepository.findById(existing.walletId as Types.ObjectId, session);
    if (!wallet) throw new WalletError("Committed wallet projection operation references no wallet.", "WALLET_INVARIANT_VIOLATION");
    return wallet;
  }

  private isOperationKeyDuplicate(error: unknown): boolean {
    return typeof error === "object" && error !== null &&
      "code" in error && (error as { code?: unknown }).code === 11000 &&
      "keyPattern" in error &&
      (error as { keyPattern?: Record<string, unknown> }).keyPattern?.operationKey === 1;
  }

  private async classifyConditionalMiss(
    walletId: Types.ObjectId,
    minimums: WalletMinimums,
    maximums: WalletMinimums,
    maximumCurrentBalance: number | undefined,
    session: ClientSession,
  ): Promise<never> {
    const wallet = await walletRepository.findById(walletId, session);
    if (!wallet) throw new WalletError("Wallet not found.", "WALLET_NOT_FOUND");
    if (wallet.currentBalance !== wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
      throw new WalletError("Wallet balance invariant is invalid.", "WALLET_INVARIANT_VIOLATION");
    }
    const belowMinimum = (["availableBalance", "reservedBalance", "lockedBalance"] as const)
      .some((field) => minimums[field] !== undefined && wallet[field] < minimums[field]!);
    if (belowMinimum) throw new WalletError("Wallet balance minimum was not satisfied.", "WALLET_INSUFFICIENT_BALANCE");
    const aboveMaximum = (["availableBalance", "reservedBalance", "lockedBalance"] as const)
      .some((field) => maximums[field] !== undefined && wallet[field] > maximums[field]!);
    if (aboveMaximum || (maximumCurrentBalance !== undefined && wallet.currentBalance > maximumCurrentBalance)) {
      throw new WalletError("Wallet maximum balance would be exceeded.", "WALLET_MAXIMUM_BALANCE_EXCEEDED");
    }
    throw new WalletError("Wallet projection mutation conflicted. Retry the operation.", "WALLET_PROJECTION_CONFLICT");
  }

  async applyProjectionMutation(
    input: ApplyWalletProjectionInput,
    suppliedSession?: ClientSession,
  ): Promise<WalletDocument> {
    if (suppliedSession && !suppliedSession.inTransaction()) {
      throw new WalletError(
        "Wallet projection mutations require an active caller-owned transaction.",
        "WALLET_TRANSACTION_REQUIRED",
      );
    }

    const currency = normalizeWalletCurrency(input.currency);
    if (!input.operationKey?.trim()) throw new WalletError("Wallet projection operation key is required.", "WALLET_OPERATION_KEY_REQUIRED");
    const deltas = this.normalizedDeltas(input.deltas);
    const providedMinimums = input.minimums ?? {};
    this.validateMinimums(providedMinimums);
    const minimums = this.normalizedMinimums(deltas, providedMinimums);
    const maximums = this.maximums(deltas);
    const totalDelta = deltas.availableBalance + deltas.reservedBalance + deltas.lockedBalance;
    const ledgerEntryIds = this.normalizedLedgerEntryIds(input.ledgerEntryIds);
    const fingerprint = this.fingerprint(input, currency, deltas, minimums, ledgerEntryIds);
    const execute = async (session: ClientSession): Promise<WalletDocument> => {
      const replay = await this.replayOrConflict(input.operationKey.trim(), fingerprint, session);
      if (replay) return replay;
      const wallet = await walletRepository.findByUserAndCurrency(input.userId, currency, session);
      if (!wallet) throw new WalletError("Wallet not found.", "WALLET_NOT_FOUND");
      const updated = await walletRepository.applyConditionalDelta(
        wallet._id as Types.ObjectId,
        minimums,
        maximums,
        totalDelta > 0 ? FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - totalDelta : undefined,
        {
          $inc: {
            availableBalance: deltas.availableBalance,
            reservedBalance: deltas.reservedBalance,
            lockedBalance: deltas.lockedBalance,
            currentBalance: deltas.availableBalance + deltas.reservedBalance + deltas.lockedBalance,
            projectionVersion: 1,
          },
          $set: { lastSyncedAt: new Date() },
        },
        session,
      );
      if (!updated) {
        await this.classifyConditionalMiss(
          wallet._id as Types.ObjectId,
          minimums,
          maximums,
          totalDelta > 0 ? FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - totalDelta : undefined,
          session,
        );
        throw new WalletError("Wallet projection mutation conflicted.", "WALLET_PROJECTION_CONFLICT");
      }
      await walletProjectionOperationRepository.create({
        operationReference: `WPO-${crypto.createHash("sha256").update(input.operationKey.trim()).digest("hex").slice(0, 16).toUpperCase()}`,
        walletId: updated._id,
        userId: input.userId,
        currency,
        operationKey: input.operationKey.trim(),
        fingerprint,
        deltas,
        ledgerEntryIds,
        projectionVersion: updated.projectionVersion,
      }, session);
      return updated;
    };

    if (suppliedSession) return execute(suppliedSession);
    const session = await mongoose.startSession();
    let result: WalletDocument | null = null;
    try {
      await session.withTransaction(async () => { result = await execute(session); });
    } catch (error) {
      if (!this.isOperationKeyDuplicate(error)) throw error;
      const replay = await this.replayOrConflict(input.operationKey.trim(), fingerprint);
      if (replay) return replay;
      throw error;
    }
    finally { await session.endSession(); }
    if (!result) throw new WalletError("Wallet projection mutation did not commit.", "WALLET_PROJECTION_CONFLICT");
    return result;
  }
}

export const walletProjectionService = new WalletProjectionService();
