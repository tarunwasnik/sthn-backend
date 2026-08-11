import { NextFunction, Request, Response } from "express";

import { adminWalletConversionDecisionService } from
  "../services/financial/adminWalletConversionDecision.service";

export class AdminWalletConversionDecisionController {
  async decide(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some((key) => ![
          "decision", "rejectionCode", "rejectionReason",
        ].includes(key))) {
        return void res.status(400).json({ success: false,
          message: "Invalid Wallet conversion decision." });
      }
      const data = await adminWalletConversionDecisionService.decide({
        adminUserId: req.user.id,
        conversionReference: req.params.conversionReference,
        decision: req.body.decision,
        rejectionCode: req.body.rejectionCode,
        rejectionReason: req.body.rejectionReason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      res.json({ success: true, data: await adminWalletConversionDecisionService
        .list(req.user.id, req.query as Record<string, unknown>) });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      res.json({ success: true, data: await adminWalletConversionDecisionService
        .get(req.user.id, req.params.conversionReference) });
    } catch (error) { next(error); }
  }
}

export const adminWalletConversionDecisionController =
  new AdminWalletConversionDecisionController();
