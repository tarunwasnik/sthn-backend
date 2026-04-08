"use strict";
//backend/src/controllers/adminDashboard/admminPayments.Controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPayments = void 0;
const adminPayments_service_1 = require("../../services/adminDashboard/adminPayments.service");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
/**
 * Admin payments list (placeholder-safe)
 * Pagination-ready even if empty
 */
exports.getAllPayments = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const payments = await (0, adminPayments_service_1.getAllPaymentsService)();
    // Since payments are not implemented yet
    const total = Array.isArray(payments) ? payments.length : 0;
    res.json((0, adminResponse_1.adminResponse)({
        data: payments,
        pagination: {
            page,
            limit,
            total
        }
    }));
});
