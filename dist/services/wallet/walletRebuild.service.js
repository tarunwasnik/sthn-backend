"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletRebuildService = exports.WalletRebuildService = void 0;
const WalletError_1 = require("../../errors/financial/WalletError");
/** No wallet-specific immutable Ledger stream exists yet, so rebuild is unsafe. */
class WalletRebuildService {
    async rebuild(_userId) {
        throw new WalletError_1.WalletError("Wallet rebuild is unavailable until Wallet-specific Ledger effects exist.", "WALLET_REBUILD_UNAVAILABLE");
    }
    async requiresRebuild(_userId) { return false; }
    async rebuildAll() {
        throw new WalletError_1.WalletError("Wallet rebuild is unavailable until Wallet-specific Ledger effects exist.", "WALLET_REBUILD_UNAVAILABLE");
    }
}
exports.WalletRebuildService = WalletRebuildService;
exports.walletRebuildService = new WalletRebuildService();
