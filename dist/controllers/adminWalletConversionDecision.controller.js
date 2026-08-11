"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletConversionDecisionController = exports.AdminWalletConversionDecisionController = void 0;
const adminWalletConversionDecision_service_1 = require("../services/financial/adminWalletConversionDecision.service");
class AdminWalletConversionDecisionController {
    async decide(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
                Object.keys(req.body).some((key) => ![
                    "decision", "rejectionCode", "rejectionReason",
                ].includes(key))) {
                return void res.status(400).json({ success: false,
                    message: "Invalid Wallet conversion decision." });
            }
            const data = await adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.decide({
                adminUserId: req.user.id,
                conversionReference: req.params.conversionReference,
                decision: req.body.decision,
                rejectionCode: req.body.rejectionCode,
                rejectionReason: req.body.rejectionReason,
            });
            res.json({ success: true, data });
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
            res.json({ success: true, data: await adminWalletConversionDecision_service_1.adminWalletConversionDecisionService
                    .list(req.user.id, req.query) });
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
            res.json({ success: true, data: await adminWalletConversionDecision_service_1.adminWalletConversionDecisionService
                    .get(req.user.id, req.params.conversionReference) });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminWalletConversionDecisionController = AdminWalletConversionDecisionController;
exports.adminWalletConversionDecisionController = new AdminWalletConversionDecisionController();
