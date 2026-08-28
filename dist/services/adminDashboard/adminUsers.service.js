"use strict";
//backend/src/services/adminDashboard/adminUsers.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsersService = void 0;
const User_1 = __importDefault(require("../../models/User"));
const adminUserList_dto_1 = require("../../dtos/admin/adminUserList.dto");
const getAllUsersService = async (page, limit) => {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        User_1.default.find()
            .select("email role status creatorStatus createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        User_1.default.countDocuments()
    ]);
    return { data: data.map(adminUserList_dto_1.toAdminUserListDto), total };
};
exports.getAllUsersService = getAllUsersService;
