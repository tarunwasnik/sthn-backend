import { NextFunction, Request, Response } from "express";

import { withdrawalService } from "../services/financial/withdrawal.service";
import { creatorWithdrawalRequestService } from "../services/financial/creatorWithdrawalRequest.service";
import { withdrawalPayoutLifecycleService } from "../services/financial/withdrawalPayoutLifecycle.service";
import { IWithdrawal } from "../models/withdrawal.model";
import { IPayout } from "../models/payout.model";
import { WithdrawalStatus } from "../enums/financial/withdrawalStatus.enum";

export class WithdrawalController {
  private serialize(withdrawal: IWithdrawal, payout: IPayout) {
    return {
      withdrawal: {
        _id: withdrawal._id,
        withdrawalReference: withdrawal.withdrawalReference,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        status: withdrawal.status,
        requestedAt: withdrawal.requestedAt,
        reservedAt: withdrawal.reservedAt,
        processingAt: withdrawal.processingAt,
        completedAt: withdrawal.completedAt,
        failedAt: withdrawal.failedAt,
        failureReason: withdrawal.failureReason,
        ...(withdrawal.destinationSnapshot ? {
          destination: {
            version: withdrawal.destinationSnapshot.version,
            destinationReference: withdrawal.destinationSnapshot.destinationReference,
            type: withdrawal.destinationSnapshot.type,
            maskedIdentifier: withdrawal.destinationSnapshot.maskedIdentifier,
            accountNumberLast4: withdrawal.destinationSnapshot.accountNumberLast4,
            ifscDisplay: withdrawal.destinationSnapshot.ifscDisplay,
            verificationStatus: withdrawal.destinationSnapshot.verificationStatus,
            verifiedAt: withdrawal.destinationSnapshot.verifiedAt,
            snapshotCreatedAt: withdrawal.destinationSnapshot.snapshotCreatedAt,
          },
        } : {}),
      },
      payout: {
        _id: payout._id,
        payoutReference: payout.payoutReference,
        status: payout.status,
      },
    };
  }

  async requestWithdrawal(
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

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ success: false, message: "Invalid withdrawal request." });
        return;
      }
      const allowedFields = new Set(["amount", "currency", "destinationReference", "idempotencyKey"]);
      const unsupported = Object.keys(req.body).find((field) => !allowedFields.has(field));
      if (unsupported) {
        res.status(400).json({ success: false, message: `Unsupported withdrawal field: ${unsupported}.` });
        return;
      }
      const { amount, currency, destinationReference, idempotencyKey } = req.body;

      const withdrawal = await creatorWithdrawalRequestService.request({
        authenticatedUserId: req.user.id,
        amount: {
          amount,
          currency,
        },
        destinationReference,
        idempotencyKey,
      });

      res.status(201).json({
        success: true,
        data: withdrawal,
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshWithdrawalPayout(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const withdrawal = await withdrawalService.getWithdrawal(
        req.params.withdrawalId,
      );

      if (withdrawal.creatorId.toString() !== req.user.id) {
        res.status(403).json({ success: false, message: "Forbidden" });
        return;
      }

      const processed =
        await withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(
          withdrawal._id.toString(),
        );

      res.status(200).json({
        success: true,
        data: this.serialize(processed.withdrawal, processed.payout),
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
      const withdrawal = await withdrawalService.cancelWithdrawal(req.params.withdrawalId, req.user.id, typeof req.body?.reason === "string" ? req.body.reason : undefined);
      res.status(200).json({ success: true, data: { withdrawalReference: withdrawal.withdrawalReference, status: withdrawal.status, cancelledAt: withdrawal.cancelledAt } });
    } catch (error) { next(error); }
  }
  async listWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> { try { if (!req.user) { res.status(401).json({ success: false }); return; } const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20)); const { withdrawalRepository } = await import("../repositories/withdrawal.repository"); const rows = await withdrawalRepository.listByCreator(req.user.id, page, limit, typeof req.query.status === "string" ? req.query.status : undefined); res.json({ success: true, data: rows.map((w) => ({ withdrawalReference: w.withdrawalReference, amount: w.amount, currency: w.currency, status: w.status, requestedAt: w.requestedAt, cancelledAt: w.cancelledAt, failedAt: w.failedAt, completedAt: w.completedAt })) }); } catch (error) { next(error); } }
  async getWithdrawalByReference(req: Request, res: Response, next: NextFunction): Promise<void> { try { if (!req.user) { res.status(401).json({ success: false }); return; } const { withdrawalRepository } = await import("../repositories/withdrawal.repository"); const withdrawal = await withdrawalRepository.findByReferenceForCreator(req.params.withdrawalReference, req.user.id); if (!withdrawal) { res.status(404).json({ success: false, message: "Withdrawal not found" }); return; } res.json({ success: true, data: { withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, status: withdrawal.status, requestedAt: withdrawal.requestedAt, cancelledAt: withdrawal.cancelledAt, failedAt: withdrawal.failedAt, completedAt: withdrawal.completedAt, cancellationAllowed: withdrawal.status === WithdrawalStatus.RESERVED } }); } catch (error) { next(error); } }
}

export const withdrawalController = new WithdrawalController();
