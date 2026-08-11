"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletConversionAccountingController = exports.AdminWalletConversionAccountingController = void 0;
const walletConversionAccounting_service_1 = require("../services/financial/walletConversionAccounting.service");
class AdminWalletConversionAccountingController {
    async complete(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (req.body && (typeof req.body !== "object" ||
                Array.isArray(req.body) || Object.keys(req.body).length)) {
                return void res.status(400).json({ success: false,
                    message: "Accounting request body is not allowed." });
            }
            const data = await walletConversionAccounting_service_1.walletConversionAccountingService.account(req.params.conversionReference);
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminWalletConversionAccountingController = AdminWalletConversionAccountingController;
exports.adminWalletConversionAccountingController = new AdminWalletConversionAccountingController();
