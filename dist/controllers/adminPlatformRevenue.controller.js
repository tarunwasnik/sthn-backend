"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPlatformRevenueController = void 0;
const platformRevenue_service_1 = require("../services/financial/platformRevenue.service");
exports.adminPlatformRevenueController = {
    summary: async (_req, res, next) => { try {
        res.json({ success: true, data: await platformRevenue_service_1.platformRevenueService.summary() });
    }
    catch (error) {
        next(error);
    } },
    entries: async (req, res, next) => { try {
        res.json({ success: true, data: await platformRevenue_service_1.platformRevenueService.entries(req.query) });
    }
    catch (error) {
        next(error);
    } },
};
