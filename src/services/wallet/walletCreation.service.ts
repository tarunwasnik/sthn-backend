import { ClientSession, Types } from "mongoose";

import {
  SupportedCurrency,
} from "../../constants/financial/supportedCurrencies";
import { WalletDocument } from "../../models/wallet.model";
import { WalletError } from "../../errors/financial/WalletError";
import { UserProfile } from "../../models/userProfile.model";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { currencyMetadataService } from
  "../financial/currencyMetadata.service";

export function normalizeWalletCurrency(value: string): SupportedCurrency {
  try {
    return currencyMetadataService.normalize(value);
  } catch {
    throw new WalletError("Wallet currency is unsupported.", "WALLET_UNSUPPORTED_CURRENCY");
  }
}

export class WalletCreationService {
  private async assertVerifiedProfile(
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const profile = await UserProfile.findOne({
      userId,
      profileStatus: "verified",
    })
      .select("_id")
      .session(session ?? null)
      .exec();
    if (!profile) {
      throw new WalletError(
        "Wallet creation requires a verified user profile.",
        "WALLET_PROFILE_NOT_VERIFIED",
      );
    }
  }

  async createWallet(
    userId: Types.ObjectId,
    currency: SupportedCurrency,
    session?: ClientSession,
  ): Promise<WalletDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new WalletError("Wallet user identity is invalid.", "WALLET_INVALID_USER");
    }
    const normalizedCurrency = normalizeWalletCurrency(currency);
    const existing = await walletRepository.findByUserAndCurrency(userId, normalizedCurrency, session);
    if (existing) return existing;

    await this.assertVerifiedProfile(userId, session);

    try {
      return await walletRepository.createZeroBalance(userId, normalizedCurrency, session);
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000)) {
        throw error;
      }
      if (session) {
        throw new WalletError("Wallet creation conflicted in the caller-owned transaction.", "WALLET_CREATION_CONFLICT", error);
      }
      const raced = await walletRepository.findByUserAndCurrency(userId, normalizedCurrency);
      if (raced) return raced;
      throw new WalletError("Wallet creation conflicted. Retry the operation.", "WALLET_CREATION_CONFLICT", error);
    }
  }

  async getWallet(userId: Types.ObjectId, currency: SupportedCurrency): Promise<WalletDocument | null> {
    return walletRepository.findByUserAndCurrency(userId, normalizeWalletCurrency(currency));
  }

  async walletExists(userId: Types.ObjectId, currency: SupportedCurrency): Promise<boolean> {
    return walletRepository.exists(userId, normalizeWalletCurrency(currency));
  }
}

export const walletCreationService = new WalletCreationService();
