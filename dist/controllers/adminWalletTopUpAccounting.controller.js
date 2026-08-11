"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeWalletTopUpAccounting = void 0;
const topUpAccountingOrchestrator_service_1 = require("../services/financial/topUpAccountingOrchestrator.service");
const completeWalletTopUpAccounting = async (req, res, next) => { try {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    if (req.body && Object.keys(req.body).length)
        return res.status(400).json({ success: false, message: "Accounting request body is not allowed." });
    return res.status(200).json({ success: true, data: await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(req.params.topUpReference) });
}
catch (error) {
    next(error);
} };
exports.completeWalletTopUpAccounting = completeWalletTopUpAccounting;
