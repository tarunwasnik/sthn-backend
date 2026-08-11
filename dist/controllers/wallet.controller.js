"use strict";
// backend/src/controllers/wallet.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletController = exports.WalletController = void 0;
const mongoose_1 = require("mongoose");
const walletQuery_service_1 = require("../services/wallet/walletQuery.service");
const walletCreation_service_1 = require("../services/wallet/walletCreation.service");
const getWallet_response_dto_1 = require("../dtos/wallet/getWallet.response.dto");
const WalletError_1 = require("../errors/financial/WalletError");
const currencyMetadata_service_1 = require("../services/financial/currencyMetadata.service");
const currencyMetadata_response_dto_1 = require("../dtos/wallet/currencyMetadata.response.dto");
/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Controller
 * ============================================================
 *
 * Responsibility
 * --------------
 * Exposes Wallet projection APIs.
 *
 * IMPORTANT
 * ---------
 * - No business logic.
 * - No balance calculations.
 * - No database access.
 * - Delegates all work to Wallet services.
 * ============================================================
 */
class WalletController {
    async listCurrencies(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }
            res.status(200).json({
                success: true,
                data: currencyMetadata_service_1.currencyMetadataService.listEnabled()
                    .map(currencyMetadata_response_dto_1.toCurrencyMetadataResponseDto),
            });
        }
        catch (error) {
            next(error);
        }
    }
    async listWallets(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }
            const wallets = await walletQuery_service_1.walletQueryService.listWallets(new mongoose_1.Types.ObjectId(req.user.id));
            res.status(200).json({
                success: true,
                data: wallets.map(getWallet_response_dto_1.toWalletListItemResponseDto),
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /wallet
     */
    async getWallet(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
                return;
            }
            const userId = new mongoose_1.Types.ObjectId(req.user.id);
            const wallet = await walletQuery_service_1.walletQueryService.getWallet(userId, this.currency(req));
            if (!wallet) {
                res.status(404).json({
                    success: false,
                    message: "Wallet not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: (0, getWallet_response_dto_1.toWalletResponseDto)(wallet),
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /wallet/balance
     */
    async getBalance(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
                return;
            }
            const userId = new mongoose_1.Types.ObjectId(req.user.id);
            const balance = await walletQuery_service_1.walletQueryService.getBalance(userId, this.currency(req));
            if (!balance) {
                res.status(404).json({
                    success: false,
                    message: "Wallet not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: balance,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /wallet/summary
     */
    async getSummary(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
                return;
            }
            const userId = new mongoose_1.Types.ObjectId(req.user.id);
            const summary = await walletQuery_service_1.walletQueryService.getSummary(userId, this.currency(req));
            if (!summary) {
                res.status(404).json({
                    success: false,
                    message: "Wallet not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: summary,
            });
        }
        catch (error) {
            next(error);
        }
    }
    currency(req) {
        const value = req.query.currency;
        if (value === undefined)
            return undefined;
        if (typeof value !== "string")
            throw new WalletError_1.WalletError("Currency query parameter must be a string.", "WALLET_INVALID_CURRENCY");
        return (0, walletCreation_service_1.normalizeWalletCurrency)(value);
    }
}
exports.WalletController = WalletController;
exports.walletController = new WalletController();
