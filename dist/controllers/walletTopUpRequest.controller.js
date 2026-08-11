"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRequestController = exports.WalletTopUpRequestController = void 0;
const walletTopUpRequest_service_1 = require("../services/financial/walletTopUpRequest.service");
class WalletTopUpRequestController {
    async create(req, res, next) { try {
        if (!req.user)
            return void res.status(401).json({ success: false, message: "Unauthorized" });
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
            return void res.status(400).json({ success: false, message: "Invalid top-up request." });
        const keys = Object.keys(req.body);
        if (keys.some((key) => !["amount", "currency"].includes(key)))
            return void res.status(400).json({ success: false, message: "Unsupported top-up request field." });
        const request = await walletTopUpRequest_service_1.walletTopUpRequestService.create(req.user.id, { amount: req.body.amount, currency: req.body.currency, idempotencyKey: req.header("Idempotency-Key") });
        res.status(201).json({ success: true, data: request });
    }
    catch (error) {
        next(error);
    } }
    async list(req, res, next) { try {
        if (!req.user)
            return void res.status(401).json({ success: false, message: "Unauthorized" });
        res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.listOwn(req.user.id, req.query.page, req.query.limit) });
    }
    catch (error) {
        next(error);
    } }
    async get(req, res, next) { try {
        if (!req.user)
            return void res.status(401).json({ success: false, message: "Unauthorized" });
        res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.getOwn(req.user.id, req.params.topUpReference) });
    }
    catch (error) {
        next(error);
    } }
}
exports.WalletTopUpRequestController = WalletTopUpRequestController;
exports.walletTopUpRequestController = new WalletTopUpRequestController();
