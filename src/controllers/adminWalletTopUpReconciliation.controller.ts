import { NextFunction, Request, Response } from "express";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpReconciliationClassification } from "../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpReconciliationStatus } from "../enums/financial/walletTopUpReconciliationStatus.enum";
import { WalletTopUpReconciliationSeverity } from "../enums/financial/walletTopUpReconciliationSeverity.enum";
import { walletTopUpReconciliationService } from "../services/financial/walletTopUpReconciliation.service";
import { walletTopUpProviderFailureService } from "../services/financial/walletTopUpProviderFailure.service";
import { walletTopUpRetryService } from "../services/financial/walletTopUpRetry.service";
import { walletTopUpRepairService } from "../services/financial/walletTopUpRepair.service";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class AdminWalletTopUpReconciliationController {
  async inspect(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await walletTopUpReconciliationService.inspect(
        req.params.topUpReference, req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const status = typeof req.query.status === "string" &&
        Object.values(WalletTopUpReconciliationStatus).includes(
          req.query.status as WalletTopUpReconciliationStatus,
        ) ? req.query.status as WalletTopUpReconciliationStatus : undefined;
      const classification = typeof req.query.classification === "string" &&
        Object.values(WalletTopUpReconciliationClassification).includes(
          req.query.classification as WalletTopUpReconciliationClassification,
        ) ? req.query.classification as WalletTopUpReconciliationClassification : undefined;
      const severity = typeof req.query.severity === "string" &&
        Object.values(WalletTopUpReconciliationSeverity).includes(
          req.query.severity as WalletTopUpReconciliationSeverity,
        ) ? req.query.severity as WalletTopUpReconciliationSeverity : undefined;
      if ((req.query.status !== undefined && !status) ||
        (req.query.classification !== undefined && !classification) ||
        (req.query.severity !== undefined && !severity)) {
        return res.status(400).json({ success: false, message: "Invalid reconciliation filter." });
      }
      const dateFrom = req.query.dateFrom === undefined ? undefined : new Date(String(req.query.dateFrom));
      const dateTo = req.query.dateTo === undefined ? undefined : new Date(String(req.query.dateTo));
      if ((dateFrom && Number.isNaN(dateFrom.valueOf())) ||
        (dateTo && Number.isNaN(dateTo.valueOf())) ||
        (dateFrom && dateTo && dateFrom > dateTo)) {
        return res.status(400).json({ success: false, message: "Invalid reconciliation date range." });
      }
      const data = await walletTopUpReconciliationService.list({
        page: req.query.page,
        limit: req.query.limit,
        status,
        classification,
        severity,
        topUpReference: typeof req.query.topUpReference === "string"
          ? req.query.topUpReference.trim() || undefined : undefined,
        providerFundingReference: typeof req.query.providerFundingReference === "string"
          ? req.query.providerFundingReference.trim() || undefined : undefined,
        dateFrom,
        dateTo,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async finalizeProviderFailure(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (req.body && Object.keys(req.body).length) {
        return res.status(400).json({ success: false, message: "Request body is not allowed." });
      }
      const data = await walletTopUpProviderFailureService.finalize(
        req.params.topUpReference, req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async retry(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!isObject(req.body) || Object.keys(req.body).some((key) => key !== "action") ||
        ![WalletTopUpOperationalAction.RETRY_ACCOUNTING, WalletTopUpOperationalAction.RETRY_COMPLETION]
          .includes(req.body.action as WalletTopUpOperationalAction)) {
        return res.status(400).json({ success: false, message: "Invalid retry action." });
      }
      const data = await walletTopUpRetryService.retry(
        req.params.reconciliationReference,
        req.body.action as WalletTopUpOperationalAction,
        req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async repair(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!isObject(req.body) || Object.keys(req.body).some((key) => key !== "action") ||
        ![
          WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS,
          WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
          WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK,
        ].includes(req.body.action as WalletTopUpOperationalAction)) {
        return res.status(400).json({ success: false, message: "Invalid repair action." });
      }
      const data = await walletTopUpRepairService.repair(
        req.params.reconciliationReference,
        req.body.action as WalletTopUpOperationalAction,
        req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      if (!isObject(req.body) ||
        Object.keys(req.body).some((key) => !["action", "resolutionCode", "resolutionNote"].includes(key)) ||
        ![WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
          WalletTopUpOperationalAction.RESOLVE_RECONCILIATION]
          .includes(req.body.action as WalletTopUpOperationalAction) ||
        typeof req.body.resolutionCode !== "string" ||
        !req.body.resolutionCode.trim() || req.body.resolutionCode.trim().length > 100 ||
        (req.body.resolutionNote !== undefined &&
          (typeof req.body.resolutionNote !== "string" ||
            req.body.resolutionNote.trim().length > 500))) {
        return res.status(400).json({ success: false, message: "Invalid reconciliation status action." });
      }
      const data = await walletTopUpReconciliationService.updateStatus({
        reconciliationReference: req.params.reconciliationReference,
        action: req.body.action as WalletTopUpOperationalAction,
        resolutionCode: req.body.resolutionCode.trim(),
        resolutionNote: typeof req.body.resolutionNote === "string"
          ? req.body.resolutionNote.trim() || undefined : undefined,
        adminUserId: req.user.id,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }
}

export const adminWalletTopUpReconciliationController =
  new AdminWalletTopUpReconciliationController();
