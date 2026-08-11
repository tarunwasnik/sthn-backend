import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

import { CreatorWithdrawalOperationalAction as Action } from
  "../enums/financial/creatorWithdrawalOperationalAction.enum";
import { CreatorWithdrawalOperationalClassification as Classification } from
  "../enums/financial/creatorWithdrawalOperationalClassification.enum";
import { CreatorWithdrawalOperationalSeverity as Severity } from
  "../enums/financial/creatorWithdrawalOperationalSeverity.enum";
import { CreatorWithdrawalReconciliationStatus as Status } from
  "../enums/financial/creatorWithdrawalReconciliationStatus.enum";
import { creatorWithdrawalFinalizationRetryService } from
  "../services/financial/creatorWithdrawalFinalizationRetry.service";
import { creatorWithdrawalReconciliationService } from
  "../services/financial/creatorWithdrawalReconciliation.service";
import { creatorWithdrawalRepairService } from
  "../services/financial/creatorWithdrawalRepair.service";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class AdminCreatorWithdrawalOperationalController {
  async inspect(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (req.body && Object.keys(req.body).length) return res.status(400).json({
        success: false, message: "Request body is not allowed.",
      });
      const data = await creatorWithdrawalReconciliationService.inspect(
        req.params.withdrawalReference, req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false,
        message: "Unauthorized" });
      const status = typeof req.query.status === "string" &&
        Object.values(Status).includes(req.query.status as Status)
        ? req.query.status as Status : undefined;
      const classification = typeof req.query.classification === "string" &&
        Object.values(Classification).includes(
          req.query.classification as Classification)
        ? req.query.classification as Classification : undefined;
      const severity = typeof req.query.severity === "string" &&
        Object.values(Severity).includes(req.query.severity as Severity)
        ? req.query.severity as Severity : undefined;
      if ((req.query.status !== undefined && !status) ||
        (req.query.classification !== undefined && !classification) ||
        (req.query.severity !== undefined && !severity)) {
        return res.status(400).json({ success: false,
          message: "Invalid reconciliation filter." });
      }
      const creatorReference = typeof req.query.creatorReference === "string"
        ? req.query.creatorReference : undefined;
      if (creatorReference && !Types.ObjectId.isValid(creatorReference)) {
        return res.status(400).json({ success: false,
          message: "Invalid Creator reference." });
      }
      const dateFrom = req.query.dateFrom === undefined ? undefined
        : new Date(String(req.query.dateFrom));
      const dateTo = req.query.dateTo === undefined ? undefined
        : new Date(String(req.query.dateTo));
      if ((dateFrom && Number.isNaN(dateFrom.valueOf())) ||
        (dateTo && Number.isNaN(dateTo.valueOf())) ||
        (dateFrom && dateTo && dateFrom > dateTo)) {
        return res.status(400).json({ success: false,
          message: "Invalid reconciliation date range." });
      }
      const retryReady = req.query.retryReady === undefined ? undefined
        : req.query.retryReady === "true" ? true
          : req.query.retryReady === "false" ? false : null;
      if (retryReady === null) return res.status(400).json({ success: false,
        message: "Invalid retry-ready filter." });
      const data = await creatorWithdrawalReconciliationService.list({
        page: req.query.page, limit: req.query.limit, status, classification,
        severity,
        withdrawalReference: typeof req.query.withdrawalReference === "string"
          ? req.query.withdrawalReference.trim() || undefined : undefined,
        providerRequestReference:
          typeof req.query.providerRequestReference === "string"
            ? req.query.providerRequestReference.trim() || undefined : undefined,
        creatorId: creatorReference ? new Types.ObjectId(creatorReference) : undefined,
        dateFrom, dateTo, retryReady: retryReady ?? undefined,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async retry(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (req.body && Object.keys(req.body).length) return res.status(400).json({
        success: false, message: "Request body is not allowed.",
      });
      const data = await creatorWithdrawalFinalizationRetryService.retry(
        req.params.reconciliationReference, req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async repair(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!object(req.body) || Object.keys(req.body).length !== 1 ||
        ![Action.RESTORE_FINALIZATION_LINKS,
          Action.RESTORE_TERMINAL_AUDIT].includes(req.body.action as Action)) {
        return res.status(400).json({ success: false,
          message: "Invalid withdrawal repair action." });
      }
      const data = await creatorWithdrawalRepairService.repair(
        req.params.reconciliationReference, req.body.action as Action,
        req.user.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false,
        message: "Unauthorized" });
      if (!object(req.body) || Object.keys(req.body).some((key) =>
        !["action", "resolutionCode", "resolutionNote"].includes(key)) ||
        ![Action.ACKNOWLEDGE, Action.RESOLVE].includes(req.body.action as Action) ||
        typeof req.body.resolutionCode !== "string" ||
        !req.body.resolutionCode.trim() ||
        req.body.resolutionCode.trim().length > 100 ||
        (req.body.resolutionNote !== undefined &&
          (typeof req.body.resolutionNote !== "string" ||
            req.body.resolutionNote.trim().length > 500))) {
        return res.status(400).json({ success: false,
          message: "Invalid reconciliation status action." });
      }
      const data = await creatorWithdrawalReconciliationService.updateStatus({
        reconciliationReference: req.params.reconciliationReference,
        action: req.body.action as Action,
        resolutionCode: req.body.resolutionCode.trim(),
        resolutionNote: typeof req.body.resolutionNote === "string"
          ? req.body.resolutionNote.trim() || undefined : undefined,
        adminUserId: req.user.id,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }
}

export const adminCreatorWithdrawalOperationalController =
  new AdminCreatorWithdrawalOperationalController();
