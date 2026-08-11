import { NextFunction, Request, Response } from "express";

import { walletConversionAccountingService } from
  "../services/financial/walletConversionAccounting.service";

export class AdminWalletConversionAccountingController {
  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (req.body && (typeof req.body !== "object" ||
        Array.isArray(req.body) || Object.keys(req.body).length)) {
        return void res.status(400).json({ success: false,
          message: "Accounting request body is not allowed." });
      }
      const data = await walletConversionAccountingService.account(
        req.params.conversionReference);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }
}

export const adminWalletConversionAccountingController =
  new AdminWalletConversionAccountingController();
