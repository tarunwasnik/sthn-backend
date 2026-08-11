"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRequestController = exports.WalletConversionRequestController = void 0;
const walletConversionRequest_service_1 = require("../services/financial/walletConversionRequest.service");
class WalletConversionRequestController {
    async create(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
                Object.keys(req.body).some((key) => ![
                    "sourceCurrency", "targetCurrency", "sourceAmount",
                ].includes(key))) {
                return void res.status(400).json({ success: false,
                    message: "Invalid Wallet conversion request." });
            }
            const result = await walletConversionRequest_service_1.walletConversionRequestService.create(req.user.id, {
                sourceCurrency: req.body.sourceCurrency,
                targetCurrency: req.body.targetCurrency,
                sourceAmount: req.body.sourceAmount,
                idempotencyKey: req.header("Idempotency-Key"),
            });
            res.status(201).json({ success: true, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    async list(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            res.json({ success: true, data: await walletConversionRequest_service_1.walletConversionRequestService
                    .listOwn(req.user.id, req.query.page, req.query.limit) });
        }
        catch (error) {
            next(error);
        }
    }
    async get(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            res.json({ success: true, data: await walletConversionRequest_service_1.walletConversionRequestService
                    .getOwn(req.user.id, req.params.conversionReference) });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.WalletConversionRequestController = WalletConversionRequestController;
exports.walletConversionRequestController = new WalletConversionRequestController();
