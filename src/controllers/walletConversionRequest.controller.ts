import { NextFunction, Request, Response } from "express";

import { walletConversionRequestService } from
  "../services/financial/walletConversionRequest.service";

export class WalletConversionRequestController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some((key) => ![
          "sourceCurrency", "targetCurrency", "sourceAmount",
        ].includes(key))) {
        return void res.status(400).json({ success: false,
          message: "Invalid Wallet conversion request." });
      }
      const result = await walletConversionRequestService.create(req.user.id, {
        sourceCurrency: req.body.sourceCurrency,
        targetCurrency: req.body.targetCurrency,
        sourceAmount: req.body.sourceAmount,
        idempotencyKey: req.header("Idempotency-Key"),
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      res.json({ success: true, data: await walletConversionRequestService
        .listOwn(req.user.id, req.query.page, req.query.limit) });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      res.json({ success: true, data: await walletConversionRequestService
        .getOwn(req.user.id, req.params.conversionReference) });
    } catch (error) { next(error); }
  }
}

export const walletConversionRequestController =
  new WalletConversionRequestController();
