"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletTopUpRequestController = exports.AdminWalletTopUpRequestController = void 0;
const walletTopUpRequest_service_1 = require("../services/financial/walletTopUpRequest.service");
const walletTopUpRequestStatus_enum_1 = require("../enums/financial/walletTopUpRequestStatus.enum");
class AdminWalletTopUpRequestController {
    async list(req, res, next) {
        try {
            const status = req.query.status === undefined
                ? walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PENDING
                : typeof req.query.status === "string" && Object.values(walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus).includes(req.query.status)
                    ? req.query.status
                    : undefined;
            if (!status)
                return res.status(400).json({ success: false, message: "Invalid top-up request status filter." });
            res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.listAdminByStatus(status, req.query.page, req.query.limit) });
        }
        catch (error) {
            next(error);
        }
    }
    async get(req, res, next) { try {
        res.json({ success: true, data: await walletTopUpRequest_service_1.walletTopUpRequestService.getAdmin(req.params.topUpReference) });
    }
    catch (error) {
        next(error);
    } }
}
exports.AdminWalletTopUpRequestController = AdminWalletTopUpRequestController;
exports.adminWalletTopUpRequestController = new AdminWalletTopUpRequestController();
