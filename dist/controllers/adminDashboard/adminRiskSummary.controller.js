"use strict";
//backend/src/controllers/adminDashboard/adminRiskSummary.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRiskSummary = void 0;
const adminRiskSummary_service_1 = require("../../services/adminDashboard/adminRiskSummary.service");
/**
 * Admin risk summary
 * Aggregated alert counts
 */
const getRiskSummary = async (req, res) => {
    const summary = await (0, adminRiskSummary_service_1.getRiskSummaryService)();
    res.json(summary);
};
exports.getRiskSummary = getRiskSummary;
