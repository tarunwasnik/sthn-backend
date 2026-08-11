import { NextFunction, Request, Response } from "express";

import { walletConversionProviderExecutionService } from
  "../services/financial/walletConversionProviderExecution.service";

export class AdminWalletConversionProviderExecutionController {
  async execute(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some((key) => ![
          "outcome", "failureCode", "failureReason",
        ].includes(key))) {
        return void res.status(400).json({ success: false,
          message: "Invalid Wallet conversion provider execution." });
      }
      const data = await walletConversionProviderExecutionService.execute({
        adminUserId: req.user.id,
        conversionReference: req.params.conversionReference,
        outcome: req.body.outcome,
        failureCode: req.body.failureCode,
        failureReason: req.body.failureReason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }
}

export const adminWalletConversionProviderExecutionController =
  new AdminWalletConversionProviderExecutionController();
