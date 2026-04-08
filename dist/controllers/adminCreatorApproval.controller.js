"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCreatorApplication = exports.rejectCreatorApplication = exports.approveCreatorApplication = exports.listCreatorApplications = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorApplication_model_1 = require("../models/creatorApplication.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const User_1 = __importDefault(require("../models/User"));
const roles_1 = require("../constants/roles");
const AppError_1 = require("../utils/AppError");
const generateCreatorSlug_1 = require("../utils/generateCreatorSlug");
/* =====================================================
   LIST CREATOR APPLICATIONS
===================================================== */
const listCreatorApplications = async (req, res) => {
    const { status } = req.query;
    const filter = {};
    if (status)
        filter.status = status;
    const applications = await creatorApplication_model_1.CreatorApplication.find(filter)
        .populate("userId", "email")
        .sort({ createdAt: -1 });
    res.status(200).json({
        applications,
    });
};
exports.listCreatorApplications = listCreatorApplications;
/* =====================================================
   APPROVE CREATOR APPLICATION
===================================================== */
const approveCreatorApplication = async (req, res) => {
    const { applicationId } = req.params;
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const application = await creatorApplication_model_1.CreatorApplication.findById(applicationId).session(session);
        if (!application) {
            throw new AppError_1.AppError("Application not found", 404);
        }
        if (application.status !== "submitted") {
            throw new AppError_1.AppError("Application not eligible for approval", 400);
        }
        const user = await User_1.default.findById(application.userId).session(session);
        if (!user) {
            throw new AppError_1.AppError("User not found", 404);
        }
        const existingProfile = await creatorProfile_model_1.CreatorProfile.findOne({
            userId: application.userId,
        }).session(session);
        if (existingProfile) {
            throw new AppError_1.AppError("Creator profile already exists", 400);
        }
        const slug = await (0, generateCreatorSlug_1.generateUniqueCreatorSlug)(application.displayName);
        // ✅ FIX: Use single object instead of array
        const creatorProfile = new creatorProfile_model_1.CreatorProfile({
            userId: application.userId,
            slug,
            displayName: application.displayName,
            primaryCategory: application.primaryCategory,
            bio: application.publicBio,
            country: application.country,
            city: application.city,
            currency: application.currency,
            rating: 0,
            reviewCount: 0,
            status: "active",
        });
        await creatorProfile.save({ session });
        user.role = roles_1.ROLES.CREATOR;
        user.creatorStatus = "approved";
        await user.save({ session });
        application.status = "approved";
        await application.save({ session });
        await session.commitTransaction();
        session.endSession();
        res.json({
            message: "Creator approved successfully",
        });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({
            message: err.message || "Approval failed",
        });
    }
};
exports.approveCreatorApplication = approveCreatorApplication;
/* =====================================================
   REJECT CREATOR APPLICATION
===================================================== */
const rejectCreatorApplication = async (req, res) => {
    const { applicationId } = req.params;
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const application = await creatorApplication_model_1.CreatorApplication.findById(applicationId).session(session);
        if (!application) {
            throw new AppError_1.AppError("Application not found", 404);
        }
        if (application.status !== "submitted") {
            throw new AppError_1.AppError("Application not eligible for rejection", 400);
        }
        const user = await User_1.default.findById(application.userId).session(session);
        if (!user) {
            throw new AppError_1.AppError("User not found", 404);
        }
        application.status = "rejected";
        await application.save({ session });
        user.creatorStatus = "none";
        await user.save({ session });
        await session.commitTransaction();
        session.endSession();
        res.json({
            message: "Creator application rejected",
        });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({
            message: err.message || "Rejection failed",
        });
    }
};
exports.rejectCreatorApplication = rejectCreatorApplication;
/* =====================================================
   DELETE CREATOR APPLICATION (Admin Cleanup)
===================================================== */
const deleteCreatorApplication = async (req, res) => {
    const { applicationId } = req.params;
    const application = await creatorApplication_model_1.CreatorApplication.findById(applicationId);
    if (!application) {
        throw new AppError_1.AppError("Application not found", 404);
    }
    await creatorApplication_model_1.CreatorApplication.findByIdAndDelete(applicationId);
    res.json({
        message: "Application deleted successfully",
    });
};
exports.deleteCreatorApplication = deleteCreatorApplication;
