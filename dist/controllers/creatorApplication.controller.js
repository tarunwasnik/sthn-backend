"use strict";
// backend/src/controllers/creatorApplication.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyCreatorApplication = exports.applyForCreator = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorApplication_model_1 = require("../models/creatorApplication.model");
const userProfile_model_1 = require("../models/userProfile.model");
const booking_model_1 = require("../models/booking.model");
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
            message = "Your profile was rejected. Please update and resubmit.";
        }
        throw new AppError_1.AppError(message, 403);
    }
    /* ================= ACTIVE BOOKING CHECK ================= */
    const blockingBooking = await booking_model_1.Booking.findOne({
        userId: authUser.id,
        status: {
            $in: ["REQUESTED", "CONFIRMED"],
        },
    })
        .select("_id status")
        .lean();
    if (blockingBooking) {
        throw new AppError_1.AppError("You can't submit a creator application while you have active or upcoming bookings. Please complete or resolve your current bookings before applying as a creator.", 403);
    }
    const existingApplication = await creatorApplication_model_1.CreatorApplication.findOne({
        userId: authUser.id,
    });
    if (existingApplication && existingApplication.status !== "rejected") {
        throw new AppError_1.AppError("Creator application already exists", 400);
    }
    /* ================= MEDIA INPUT ================= */
    const { displayName, primaryCategory, services, publicBio, currency, country, city, languages, avatarUrl, coverUrl, media, } = req.body;
    if (!displayName ||
        !primaryCategory ||
        !publicBio ||
        !currency ||
        !country ||
        !city) {
        throw new AppError_1.AppError("Missing required creator application fields", 400);
    }
    const normalizedServices = Array.isArray(services) ? services : [];
    const normalizedLanguages = Array.isArray(languages) ? languages : [];
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        let application;
        /* ================= FIRST SUBMISSION ================= */
        if (!existingApplication) {
            application = await creatorApplication_model_1.CreatorApplication.create([
                {
                    userId: authUser.id,
                    displayName,
                    primaryCategory,
                    country,
                    city,
                    currency: currency.toUpperCase(),
                    services: normalizedServices,
                    publicBio,
                    languages: normalizedLanguages,
                    avatarUrl: avatarUrl || null,
                    coverUrl: coverUrl || null,
                    media: Array.isArray(media) ? media : [],
                    status: "submitted",
                    submittedForReviewAt: new Date(),
                },
            ], { session });
        }
        else {
            /* ================= REJECTED RESUBMISSION ================= */
            existingApplication.displayName = displayName;
            existingApplication.primaryCategory = primaryCategory;
            existingApplication.country = country;
            existingApplication.city = city;
            existingApplication.currency = currency.toUpperCase();
            existingApplication.services = normalizedServices;
            existingApplication.publicBio = publicBio;
            existingApplication.languages = normalizedLanguages;
            existingApplication.avatarUrl = avatarUrl || null;
            existingApplication.coverUrl = coverUrl || null;
            existingApplication.media = Array.isArray(media) ? media : [];
            existingApplication.status = "submitted";
            existingApplication.rejectionReason = "";
            existingApplication.submittedForReviewAt = new Date();
            await existingApplication.save({ session });
            application = [existingApplication];
        }
        fullUser.creatorStatus = "pending";
        await fullUser.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(201).json({
            message: "Creator application submitted",
            application: Array.isArray(application) ? application[0] : application,
        });
    }
    catch (error) {
        console.error("🔥 CREATOR APPLY ERROR:", error);
        console.error("🔥 ERROR MESSAGE:", error?.message);
        console.error("🔥 ERROR STACK:", error?.stack);
        await session.abortTransaction();
        session.endSession();
        throw new AppError_1.AppError(error?.message || "Application submission failed", 400);
    }
};
exports.applyForCreator = applyForCreator;
const getMyCreatorApplication = async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    const application = await creatorApplication_model_1.CreatorApplication.findOne({
        userId: authUser.id,
    });
    if (!application) {
        return res.status(200).json({
            application: null,
        });
    }
    return res.status(200).json({
        application,
    });
};
exports.getMyCreatorApplication = getMyCreatorApplication;
