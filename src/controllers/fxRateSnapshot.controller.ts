import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

import { FxRateSnapshotError } from
  "../errors/financial/FxRateSnapshotError";
import { fxRateSnapshotService } from
  "../services/financial/fxRateSnapshot.service";

export class FxRateSnapshotController {
  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({
        success: false, message: "Unauthorized",
      });
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) =>
          !["baseCurrency", "quoteCurrency", "force"].includes(key)) ||
        typeof body.baseCurrency !== "string" ||
        typeof body.quoteCurrency !== "string" ||
        (body.force !== undefined && typeof body.force !== "boolean")) {
        throw new FxRateSnapshotError("FX refresh request is invalid.",
          "FX_RATE_PAIR_NOT_SUPPORTED", 400);
      }
      const data = await fxRateSnapshotService.refresh(
        body.baseCurrency, body.quoteCurrency, body.force ?? true,
        { type: "ADMIN", id: new Types.ObjectId(req.user.id) },
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async current(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({
        success: false, message: "Unauthorized",
      });
      const data = await fxRateSnapshotService.getCurrent(
        req.params.baseCurrency, req.params.quoteCurrency,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const fxRateSnapshotController = new FxRateSnapshotController();
