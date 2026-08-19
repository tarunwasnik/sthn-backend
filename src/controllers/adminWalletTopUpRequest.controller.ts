import { NextFunction, Request, Response } from "express";
import { walletTopUpRequestService } from "../services/financial/walletTopUpRequest.service";
import { WalletTopUpRequestStatus } from "../enums/financial/walletTopUpRequestStatus.enum";
export class AdminWalletTopUpRequestController {
  async list(req: Request, res: Response, next: NextFunction) { try {
    const status = req.query.status === undefined
      ? WalletTopUpRequestStatus.PENDING
      : typeof req.query.status === "string" && Object.values(WalletTopUpRequestStatus).includes(req.query.status as WalletTopUpRequestStatus)
        ? req.query.status as WalletTopUpRequestStatus
        : undefined;
    if (!status) return res.status(400).json({ success: false, message: "Invalid top-up request status filter." });
    res.json({ success: true, data: await walletTopUpRequestService.listAdminByStatus(status, req.query.page, req.query.limit) });
  } catch (error) { next(error); } }
  async get(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await walletTopUpRequestService.getAdmin(req.params.topUpReference) }); } catch (error) { next(error); } }
}
export const adminWalletTopUpRequestController = new AdminWalletTopUpRequestController();
