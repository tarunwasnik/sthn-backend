"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletQueryService = exports.WalletQueryService = void 0;
const wallet_constants_1 = require("../../constants/wallet/wallet.constants");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletCreation_service_1 = require("./walletCreation.service");
class WalletQueryService {
    async getWallet(userId, currency = wallet_constants_1.DEFAULT_WALLET_CURRENCY) {
        return wallet_repository_1.walletRepository.findByUserAndCurrency(userId, (0, walletCreation_service_1.normalizeWalletCurrency)(currency));
    }
    async getBalance(userId, currency) {
        const wallet = await this.getWallet(userId, currency);
        if (!wallet)
            return null;
        return { currency: wallet.currency, currentBalance: wallet.currentBalance, availableBalance: wallet.availableBalance, pendingBalance: wallet.pendingBalance, withdrawableBalance: wallet.withdrawableBalance, lockedBalance: wallet.lockedBalance, reservedBalance: wallet.reservedBalance };
    }
    async getSummary(userId, currency) {
        const wallet = await this.getWallet(userId, currency);
        if (!wallet)
            return null;
        return { currency: wallet.currency, lifetimeEarnings: wallet.lifetimeEarnings, totalWithdrawn: wallet.totalWithdrawn, totalRefunded: wallet.totalRefunded, platformFees: wallet.platformFees };
    }
    async listWallets(userId) {
        return wallet_repository_1.walletRepository.findAllByUser(userId);
    }
    async walletExists(userId, currency) {
        return wallet_repository_1.walletRepository.exists(userId, (0, walletCreation_service_1.normalizeWalletCurrency)(currency ?? wallet_constants_1.DEFAULT_WALLET_CURRENCY));
    }
}
exports.WalletQueryService = WalletQueryService;
exports.walletQueryService = new WalletQueryService();
