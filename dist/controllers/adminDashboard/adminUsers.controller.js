"use strict";
//backend/src/controllers/adminDashboard/adminUsers.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsers = void 0;
const adminUsers_service_1 = require("../../services/adminDashboard/adminUsers.service");
const adminResponse_1 = require("../../utils/adminResponse");
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
exports.getAllUsers = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { data, total } = await (0, adminUsers_service_1.getAllUsersService)(page, limit);
    res.json((0, adminResponse_1.adminResponse)({
        data,
        pagination: {
            page,
            limit,
            total
        }
    }));
});
