"use strict";
//backend/src/controllers/adminDashboard/adminOverview.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminOverview = void 0;
const adminOverview_service_1 = require("../../services/adminDashboard/adminOverview.service");
const adminResponse_1 = require("../../utils/adminResponse");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
/**
 * Admin Dashboard Overview
 * High-level platform KPIs
 */
exports.getAdminOverview = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    console.log("✅ NEW ADMIN OVERVIEW CONTROLLER HIT");
    const overview = await (0, adminOverview_service_1.getAdminOverviewService)();
    res.json((0, adminResponse_1.adminResponse)({
        data: overview
    }));
});
