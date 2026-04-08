"use strict";
//backend/src/controllers/adminDashboard/adminCreators.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreatorPerformance = exports.getAllCreators = void 0;
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminCreators_service_1 = require("../../services/adminDashboard/adminCreators.service");
exports.getAllCreators = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { data, total } = await (0, adminCreators_service_1.getAllCreatorsService)(page, limit);
    res.json((0, adminResponse_1.adminResponse)({
        data,
        pagination: {
            page,
            limit,
            total
        }
    }));
});
/**
 * Creator performance metrics
 */
const getCreatorPerformance = async (req, res) => {
    const data = await (0, adminCreators_service_1.getCreatorPerformanceService)();
    res.json(data);
};
exports.getCreatorPerformance = getCreatorPerformance;
