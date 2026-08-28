"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminGovernanceTargetController = void 0;
const adminAsyncHandler_1 = require("../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../utils/adminResponse");
const adminGovernanceRead_service_1 = require("../services/adminGovernanceRead.service");
exports.getAdminGovernanceTargetController = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const target = await (0, adminGovernanceRead_service_1.getAdminGovernanceTarget)(req.params.userId);
    res.json((0, adminResponse_1.adminResponse)({ data: target }));
});
