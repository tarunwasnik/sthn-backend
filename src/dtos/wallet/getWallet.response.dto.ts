import { WalletDocument } from "../../models/wallet.model";

export interface GetWalletResponseDto {
  walletId: string;
  currency: string;
  balances: { current: number; available: number; pending: number; withdrawable: number; locked: number; reserved: number };
  earnings: { lifetime: number; totalWithdrawn: number; totalRefunded: number; platformFees: number };
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toWalletResponseDto(wallet: WalletDocument): GetWalletResponseDto {
  return {
    walletId: wallet._id.toString(), currency: wallet.currency,
    balances: { current: wallet.currentBalance, available: wallet.availableBalance, pending: wallet.pendingBalance, withdrawable: wallet.withdrawableBalance, locked: wallet.lockedBalance, reserved: wallet.reservedBalance },
    earnings: { lifetime: wallet.lifetimeEarnings, totalWithdrawn: wallet.totalWithdrawn, totalRefunded: wallet.totalRefunded, platformFees: wallet.platformFees },
    lastSyncedAt: wallet.lastSyncedAt, createdAt: wallet.createdAt, updatedAt: wallet.updatedAt,
  };
}

export interface WalletListItemResponseDto {
  currency: string;
  available: number;
  reserved: number;
  locked: number;
  current: number;
  createdAt: Date;
}

export function toWalletListItemResponseDto(
  wallet: WalletDocument,
): WalletListItemResponseDto {
  return {
    currency: wallet.currency,
    available: wallet.availableBalance,
    reserved: wallet.reservedBalance,
    locked: wallet.lockedBalance,
    current: wallet.currentBalance,
    createdAt: wallet.createdAt,
  };
}
