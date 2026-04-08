"use strict";
//backend/src/controllers/adminDashboard/adminStats.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverviewStats = void 0;
const adminStats_service_1 = require("../../services/adminDashboard/adminStats.service");
const getOverviewStats = async (req, res) => {
    const stats = await (0, adminStats_service_1.getOverviewStatsService)();
    res.json(stats);
};
exports.getOverviewStats = getOverviewStats;
