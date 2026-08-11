"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWalletResponseDto = toWalletResponseDto;
exports.toWalletListItemResponseDto = toWalletListItemResponseDto;
function toWalletResponseDto(wallet) {
    return {
        walletId: wallet._id.toString(), currency: wallet.currency,
        balances: { current: wallet.currentBalance, available: wallet.availableBalance, pending: wallet.pendingBalance, withdrawable: wallet.withdrawableBalance, locked: wallet.lockedBalance, reserved: wallet.reservedBalance },
        earnings: { lifetime: wallet.lifetimeEarnings, totalWithdrawn: wallet.totalWithdrawn, totalRefunded: wallet.totalRefunded, platformFees: wallet.platformFees },
        lastSyncedAt: wallet.lastSyncedAt, createdAt: wallet.createdAt, updatedAt: wallet.updatedAt,
    };
}
function toWalletListItemResponseDto(wallet) {
    return {
        currency: wallet.currency,
        available: wallet.availableBalance,
        reserved: wallet.reservedBalance,
        locked: wallet.lockedBalance,
        current: wallet.currentBalance,
        createdAt: wallet.createdAt,
    };
}
