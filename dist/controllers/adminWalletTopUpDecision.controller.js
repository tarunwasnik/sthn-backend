"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideWalletTopUpRequest = void 0;
const adminWalletTopUpDecision_service_1 = require("../services/financial/adminWalletTopUpDecision.service");
const decideWalletTopUpRequest = async (req, res, next) => { try {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => !["decision", "rejectionCode", "rejectionReason"].includes(key)))
        return res.status(400).json({ success: false, message: "Invalid top-up decision." });
    const data = await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({ adminUserId: req.user.id, topUpReference: req.params.topUpReference, decision: req.body.decision, rejectionCode: req.body.rejectionCode, rejectionReason: req.body.rejectionReason });
    return res.status(200).json({ success: true, data });
}
catch (error) {
    next(error);
} };
exports.decideWalletTopUpRequest = decideWalletTopUpRequest;
