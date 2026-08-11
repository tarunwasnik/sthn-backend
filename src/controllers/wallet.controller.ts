// backend/src/controllers/wallet.controller.ts

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";

import { walletQueryService } from "../services/wallet/walletQuery.service";
import { normalizeWalletCurrency } from "../services/wallet/walletCreation.service";
import {
  toWalletListItemResponseDto,
  toWalletResponseDto,
} from "../dtos/wallet/getWallet.response.dto";
import { WalletError } from "../errors/financial/WalletError";
import { currencyMetadataService } from
  "../services/financial/currencyMetadata.service";
import { toCurrencyMetadataResponseDto } from
  "../dtos/wallet/currencyMetadata.response.dto";

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
export class WalletController {
  async listCurrencies(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      res.status(200).json({
        success: true,
        data: currencyMetadataService.listEnabled()
          .map(toCurrencyMetadataResponseDto),
      });
    } catch (error) {
      next(error);
    }
  }

  async listWallets(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const wallets = await walletQueryService.listWallets(
        new Types.ObjectId(req.user.id),
      );
      res.status(200).json({
        success: true,
        data: wallets.map(toWalletListItemResponseDto),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /wallet
   */
  async getWallet(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const userId = new Types.ObjectId(req.user.id);

      const wallet = await walletQueryService.getWallet(userId, this.currency(req));

      if (!wallet) {
        res.status(404).json({
          success: false,
          message: "Wallet not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: toWalletResponseDto(wallet),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /wallet/balance
   */
  async getBalance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const userId = new Types.ObjectId(req.user.id);

      const balance = await walletQueryService.getBalance(userId, this.currency(req));

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
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /wallet/summary
   */
  async getSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const userId = new Types.ObjectId(req.user.id);

      const summary = await walletQueryService.getSummary(userId, this.currency(req));

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
    } catch (error) {
      next(error);
    }
  }

  private currency(req: Request) {
    const value = req.query.currency;
    if (value === undefined) {
      throw new WalletError("Currency query parameter is required.",
        "WALLET_INVALID_CURRENCY");
    }
    if (typeof value !== "string") throw new WalletError("Currency query parameter must be a string.", "WALLET_INVALID_CURRENCY");
    return normalizeWalletCurrency(value);
  }
}

export const walletController = new WalletController();
