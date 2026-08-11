"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletConversionProviderExecutionController = exports.AdminWalletConversionProviderExecutionController = void 0;
const walletConversionProviderExecution_service_1 = require("../services/financial/walletConversionProviderExecution.service");
class AdminWalletConversionProviderExecutionController {
    async execute(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
                Object.keys(req.body).some((key) => ![
                    "outcome", "failureCode", "failureReason",
                ].includes(key))) {
                return void res.status(400).json({ success: false,
                    message: "Invalid Wallet conversion provider execution." });
            }
            const data = await walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute({
                adminUserId: req.user.id,
                conversionReference: req.params.conversionReference,
                outcome: req.body.outcome,
                failureCode: req.body.failureCode,
                failureReason: req.body.failureReason,
            });
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminWalletConversionProviderExecutionController = AdminWalletConversionProviderExecutionController;
exports.adminWalletConversionProviderExecutionController = new AdminWalletConversionProviderExecutionController();
