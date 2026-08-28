"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletCreationService = exports.WalletCreationService = void 0;
exports.normalizeWalletCurrency = normalizeWalletCurrency;
const mongoose_1 = require("mongoose");
const WalletError_1 = require("../../errors/financial/WalletError");
const userProfile_model_1 = require("../../models/userProfile.model");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const currencyMetadata_service_1 = require("../financial/currencyMetadata.service");
function normalizeWalletCurrency(value) {
    try {
        return currencyMetadata_service_1.currencyMetadataService.normalize(value);
    }
    catch {
        throw new WalletError_1.WalletError("Wallet currency is unsupported.", "WALLET_UNSUPPORTED_CURRENCY");
    }
}
class WalletCreationService {
    async assertVerifiedProfile(userId, session) {
        const profile = await userProfile_model_1.UserProfile.findOne({
            userId,
            profileStatus: "verified",
        })
            .select("_id")
            .session(session ?? null)
            .exec();
        if (!profile) {
            throw new WalletError_1.WalletError("Wallet creation requires a verified user profile.", "WALLET_PROFILE_NOT_VERIFIED");
        }
    }
    async createWallet(userId, currency, session) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new WalletError_1.WalletError("Wallet user identity is invalid.", "WALLET_INVALID_USER");
        }
        const normalizedCurrency = normalizeWalletCurrency(currency);
        const existing = await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, normalizedCurrency, session);
        if (existing)
            return existing;
        await this.assertVerifiedProfile(userId, session);
        try {
            return await wallet_repository_1.walletRepository.createZeroBalance(userId, normalizedCurrency, session);
        }
        catch (error) {
            if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) {
                throw error;
            }
            if (session) {
                throw new WalletError_1.WalletError("Wallet creation conflicted in the caller-owned transaction.", "WALLET_CREATION_CONFLICT", error);
            }
            const raced = await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, normalizedCurrency);
            if (raced)
                return raced;
            throw new WalletError_1.WalletError("Wallet creation conflicted. Retry the operation.", "WALLET_CREATION_CONFLICT", error);
        }
    }
    async getWallet(userId, currency) {
        return wallet_repository_1.walletRepository.findByUserAndCurrency(userId, normalizeWalletCurrency(currency));
    }
    async walletExists(userId, currency) {
        return wallet_repository_1.walletRepository.exists(userId, normalizeWalletCurrency(currency));
    }
}
exports.WalletCreationService = WalletCreationService;
exports.walletCreationService = new WalletCreationService();
