import { NextFunction, Request, Response } from "express";
import { walletTopUpRequestService } from "../services/financial/walletTopUpRequest.service";
export class AdminWalletTopUpRequestController {
  async list(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await walletTopUpRequestService.listPending(req.query.page, req.query.limit) }); } catch (error) { next(error); } }
  async get(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await walletTopUpRequestService.getAdmin(req.params.topUpReference) }); } catch (error) { next(error); } }
}
export const adminWalletTopUpRequestController = new AdminWalletTopUpRequestController();
