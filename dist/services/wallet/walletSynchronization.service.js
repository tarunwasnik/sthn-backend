"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletSynchronizationService = exports.WalletSynchronizationService = void 0;
const WalletError_1 = require("../../errors/financial/WalletError");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletQuery_service_1 = require("./walletQuery.service");
/** Synchronization records observation only; it never changes balances/version. */
class WalletSynchronizationService {
    async synchronize(userId, currency) {
        const wallet = await walletQuery_service_1.walletQueryService.getWallet(userId, currency);
        if (!wallet)
            throw new WalletError_1.WalletError("Wallet not found.", "WALLET_NOT_FOUND");
        const updated = await wallet_repository_1.walletRepository.markSynchronized(wallet._id, new Date());
        if (!updated)
            throw new WalletError_1.WalletError("Wallet synchronization failed.", "WALLET_SYNC_CONFLICT");
        return updated;
    }
    requiresSynchronization(wallet) { return wallet.lastSyncedAt == null; }
    async markSynchronized(wallet) {
        const updated = await wallet_repository_1.walletRepository.markSynchronized(wallet._id, new Date());
        if (!updated)
            throw new WalletError_1.WalletError("Wallet synchronization failed.", "WALLET_SYNC_CONFLICT");
        return updated;
    }
}
exports.WalletSynchronizationService = WalletSynchronizationService;
exports.walletSynchronizationService = new WalletSynchronizationService();
