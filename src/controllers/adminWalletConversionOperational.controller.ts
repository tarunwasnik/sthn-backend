import { NextFunction, Request, Response } from "express";

import { WalletConversionRepairAction } from
  "../enums/financial/walletConversionRepairAction.enum";
import { WalletConversionOperationalError } from
  "../errors/financial/WalletConversionOperationalError";
import { walletConversionReconciliationRepository } from
  "../repositories/walletConversionReconciliation.repository";
import { walletConversionReconciliationService } from
  "../services/financial/walletConversionReconciliation.service";
import { walletConversionRepairService } from
  "../services/financial/walletConversionRepair.service";
import { walletConversionRetryService } from
  "../services/financial/walletConversionRetry.service";

const empty = (body: unknown) => body === undefined ||
  (typeof body === "object" && body !== null && !Array.isArray(body) &&
    Object.keys(body).length === 0);

export class AdminWalletConversionOperationalController {
  private async conversionReference(reconciliationReference: string) {
    const authority = await walletConversionReconciliationRepository
      .findByReference(reconciliationReference);
    if (!authority) throw new WalletConversionOperationalError(
      "Wallet conversion reconciliation was not found.",
      "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
    return authority.conversionReference;
  }

  async reconcile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!empty(req.body)) return void res.status(400).json({ success: false,
        message: "Reconciliation request body is not allowed." });
      const data = await walletConversionReconciliationService.reconcile(
        req.params.conversionReference, req.user.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async retry(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!empty(req.body)) return void res.status(400).json({ success: false,
        message: "Retry request body is not allowed." });
      const reference = await this.conversionReference(
        req.params.reconciliationReference);
      const data = await walletConversionRetryService.retry(reference,
        req.user.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async repair(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return void res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (typeof req.body !== "object" || req.body === null ||
        Array.isArray(req.body) || Object.keys(req.body).length !== 1 ||
        !Object.values(WalletConversionRepairAction).includes(
          req.body.action as WalletConversionRepairAction)) {
        return void res.status(400).json({ success: false,
          message: "Invalid Wallet conversion repair action." });
      }
      const reference = await this.conversionReference(
        req.params.reconciliationReference);
      const data = await walletConversionRepairService.repair(reference,
        req.body.action as WalletConversionRepairAction, req.user.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }
}

export const adminWalletConversionOperationalController =
  new AdminWalletConversionOperationalController();
