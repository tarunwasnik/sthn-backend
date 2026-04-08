"use strict";
//backend/src/services/adminMode.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAdminMode = exports.getAdminMode = void 0;
const adminMode_types_1 = require("../types/adminMode.types");
const User_1 = __importDefault(require("../models/User"));
/**
 * Get current admin mode for an admin user
 */
const getAdminMode = async (adminId) => {
    const admin = (await User_1.default.findById(adminId)
        .select("adminMode role")
        .lean());
    if (!admin) {
        throw new Error("Admin not found");
    }
    if (admin.role !== "admin") {
        throw new Error("User is not an admin");
    }
    return admin.adminMode || null;
};
exports.getAdminMode = getAdminMode;
/**
 * Set admin mode for an admin user
 */
const setAdminMode = async (adminId, mode) => {
    if (!Object.values(adminMode_types_1.ADMIN_MODES).includes(mode)) {
        throw new Error("Invalid admin mode");
    }
    const admin = await User_1.default.findById(adminId);
    if (!admin) {
        throw new Error("Admin not found");
    }
    if (admin.role !== "admin") {
        throw new Error("User is not an admin");
    }
    admin.adminMode = mode;
    await admin.save();
    return mode;
};
exports.setAdminMode = setAdminMode;
