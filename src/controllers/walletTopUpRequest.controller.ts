import { NextFunction, Request, Response } from "express";
import { walletTopUpRequestService } from "../services/financial/walletTopUpRequest.service";

export class WalletTopUpRequestController {
  async create(req: Request, res: Response, next: NextFunction) { try { if (!req.user) return void res.status(401).json({ success: false, message: "Unauthorized" }); if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return void res.status(400).json({ success: false, message: "Invalid top-up request." }); const keys = Object.keys(req.body); if (keys.some((key) => !["amount", "currency"].includes(key))) return void res.status(400).json({ success: false, message: "Unsupported top-up request field." }); const request = await walletTopUpRequestService.create(req.user.id, { amount: req.body.amount, currency: req.body.currency, idempotencyKey: req.header("Idempotency-Key") }); res.status(201).json({ success: true, data: request }); } catch (error) { next(error); } }
  async list(req: Request, res: Response, next: NextFunction) { try { if (!req.user) return void res.status(401).json({ success: false, message: "Unauthorized" }); res.json({ success: true, data: await walletTopUpRequestService.listOwn(req.user.id, req.query.page, req.query.limit) }); } catch (error) { next(error); } }
  async get(req: Request, res: Response, next: NextFunction) { try { if (!req.user) return void res.status(401).json({ success: false, message: "Unauthorized" }); res.json({ success: true, data: await walletTopUpRequestService.getOwn(req.user.id, req.params.topUpReference) }); } catch (error) { next(error); } }
}
export const walletTopUpRequestController = new WalletTopUpRequestController();
