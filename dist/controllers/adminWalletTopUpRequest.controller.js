"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletTopUpRequestController = exports.AdminWalletTopUpRequestController = void 0;
const walletTopUpRequest_service_1 = require("../services/financial/walletTopUpRequest.service");
class AdminWalletTopUpRequestController {
    async list(req, res, next) { try {
        res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.listPending(req.query.page, req.query.limit) });
    }
    catch (error) {
        next(error);
    } }
    async get(req, res, next) { try {
        res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.getAdmin(req.params.topUpReference) });
    }
    catch (error) {
        next(error);
    } }
}
exports.AdminWalletTopUpRequestController = AdminWalletTopUpRequestController;
exports.adminWalletTopUpRequestController = new AdminWalletTopUpRequestController();
