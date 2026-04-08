"use strict";
//backend/src/controllers/adminDashboard/adminRisk.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHighRiskCreators = void 0;
const adminRisk_service_1 = require("../../services/adminDashboard/adminRisk.service");
/**
 * High-risk creators overview
 * Read-only admin visibility
 */
const getHighRiskCreators = async (req, res) => {
    const data = await (0, adminRisk_service_1.getHighRiskCreatorsService)();
    res.json(data);
};
exports.getHighRiskCreators = getHighRiskCreators;
