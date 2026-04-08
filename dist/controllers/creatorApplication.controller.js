"use strict";
// backend/src/controllers/creatorApplication.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyForCreator = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorApplication_model_1 = require("../models/creatorApplication.model");
const userProfile_model_1 = require("../models/userProfile.model");
const User_1 = __importDefault(require("../models/User"));
const roles_1 = require("../constants/roles");
const AppError_1 = require("../utils/AppError");
const applyForCreator = async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    if (authUser.role !== roles_1.ROLES.USER) {
        throw new AppError_1.AppError("Only users can apply to become creators", 403);
    }
    const fullUser = await User_1.default.findById(authUser.id);
    if (!fullUser) {
        throw new AppError_1.AppError("User not found", 404);
    }
    if (fullUser.creatorStatus === "pending" ||
        fullUser.creatorStatus === "approved") {
        throw new AppError_1.AppError("Creator application already in progress or approved", 400);
    }
    const profile = await userProfile_model_1.UserProfile.findOne({
        userId: authUser.id,
    });
    if (!profile) {
        throw new AppError_1.AppError("You must complete your profile before applying", 403);
    }
    if (profile.profileStatus !== "verified") {
        let message = "Profile verification required.";
        if (profile.profileStatus === "pending_verification") {
            message = "Your profile is under verification.";
        }
        if (profile.profileStatus === "rejected") {
            message =
                "Your profile was rejected. Please update and resubmit.";
        }
        throw new AppError_1.AppError(message, 403);
    }
    const existingApplication = await creatorApplication_model_1.CreatorApplication.findOne({
        userId: authUser.id,
    });
    if (existingApplication) {
        throw new AppError_1.AppError("Creator application already exists", 400);
    }
    const { displayName, primaryCategory, services, publicBio, verificationMedia, currency, country, city, } = req.body;
    if (!displayName ||
        !primaryCategory ||
        !publicBio ||
        !currency ||
        !country ||
        !city) {
        throw new AppError_1.AppError("Missing required creator application fields", 400);
    }
    const normalizedServices = Array.isArray(services) ? services : [];
    const normalizedMedia = Array.isArray(verificationMedia)
        ? verificationMedia
        : [];
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const application = await creatorApplication_model_1.CreatorApplication.create([
            {
                userId: authUser.id,
                displayName,
                primaryCategory,
                country,
                city,
                currency: currency.toUpperCase(),
                services: normalizedServices,
                publicBio,
                verificationMedia: normalizedMedia,
                status: "submitted",
            },
        ], { session });
        fullUser.creatorStatus = "pending";
        await fullUser.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(201).json({
            message: "Creator application submitted",
            application: application[0],
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw new AppError_1.AppError("Application submission failed", 400);
    }
};
exports.applyForCreator = applyForCreator;
