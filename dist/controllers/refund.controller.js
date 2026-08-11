"use strict";
//backend/src/controllers/refund.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestRefund = void 0;
const interactionGuards_service_1 = require("../services/interactionGuards.service");
const requestRefund = async (req, res) => {
    const { bookingId } = req.params;
    if (!req.user)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        await (0, interactionGuards_service_1.assertRefundAllowed)(bookingId);
    }
    catch (err) {
        if (err instanceof interactionGuards_service_1.InteractionGuardError) {
            return res.status(403).json({ code: err.code, message: err.message });
        }
        throw err;
    }
    return res.status(409).json({ message: "Legacy refund endpoint is disabled; refunds must be initiated by Financial termination or a later dispute workflow." });
};
exports.requestRefund = requestRefund;
