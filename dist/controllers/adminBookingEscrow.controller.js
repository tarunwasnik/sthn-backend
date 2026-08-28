"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminBookingEscrowController = exports.AdminBookingEscrowController = void 0;
const adminBookingEscrow_service_1 = require("../services/financial/adminBookingEscrow.service");
class AdminBookingEscrowRequestError extends Error {
    constructor() {
        super(...arguments);
        this.statusCode = 400;
    }
}
const readReason = (body) => {
    if (body === undefined || body === null)
        return undefined;
    if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "reason"))
        throw new AdminBookingEscrowRequestError("Invalid manual settlement release request.");
    const reason = body.reason;
    if (reason === undefined)
        return undefined;
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 240)
        throw new AdminBookingEscrowRequestError("Manual settlement release reason is invalid.");
    return reason.trim();
};
class AdminBookingEscrowController {
    async list(req, res, next) { try {
        res.json({ success: true, data: await adminBookingEscrow_service_1.adminBookingEscrowService.list({ state: req.query.state }) });
    }
    catch (error) {
        next(error);
    } }
    async get(req, res, next) { try {
        res.json({ success: true, data: await adminBookingEscrow_service_1.adminBookingEscrowService.get(req.params.bookingReference) });
    }
    catch (error) {
        next(error);
    } }
    async release(req, res, next) { try {
        if (!req.user)
            return void res.status(401).json({ success: false, message: "Unauthorized" });
        const reason = readReason(req.body);
        res.json({ success: true, data: await adminBookingEscrow_service_1.adminBookingEscrowService.release({ bookingReference: req.params.bookingReference, adminUserId: req.user.id, reason }) });
    }
    catch (error) {
        next(error);
    } }
}
exports.AdminBookingEscrowController = AdminBookingEscrowController;
exports.adminBookingEscrowController = new AdminBookingEscrowController();
