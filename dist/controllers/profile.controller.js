"use strict";
// backend/src/controllers/profile.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyProfile = exports.upsertProfile = void 0;
const userProfile_model_1 = require("../models/userProfile.model");
const User_1 = __importDefault(require("../models/User"));
const AppError_1 = require("../utils/AppError");
const uploadToCloudinary_1 = require("../utils/uploadToCloudinary");
/* ================= UTIL ================= */
const calculateAge = (dob) => {
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};
/* ================= CREATE / UPDATE PROFILE ================= */
const upsertProfile = async (req, res) => {
    console.log("🔥 BODY:", req.body);
    console.log("🔥 FILES:", req.files);
    const userId = req.user.id;
    const { username, dateOfBirth, interests, bio } = req.body;
    const files = req.files;
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    const isFirstSubmission = !profile;
    /* ================= FILE VALIDATION ================= */
    if (!files || files.length < 2 || files.length > 6) {
        throw new AppError_1.AppError("Profile must have between 2 and 6 photos", 400);
    }
    /* ================= UPLOAD TO CLOUDINARY ================= */
    const uploadedPhotos = [];
    for (const file of files) {
        const result = await (0, uploadToCloudinary_1.uploadToCloudinary)(file.buffer);
        uploadedPhotos.push(result.secure_url);
    }
    /* ================= CREATE ================= */
    if (!profile) {
        if (!username || !dateOfBirth || !bio) {
            throw new AppError_1.AppError("Required fields missing", 400);
        }
        const dob = new Date(dateOfBirth);
        const age = calculateAge(dob);
        if (age < 18) {
            throw new AppError_1.AppError("Minimum age is 18", 403);
        }
        const existingUsername = await userProfile_model_1.UserProfile.findOne({ username });
        if (existingUsername) {
            throw new AppError_1.AppError("Username already taken", 409);
        }
        profile = await userProfile_model_1.UserProfile.create({
            userId,
            username,
            dateOfBirth: dob,
            interests: Array.isArray(interests)
                ? interests
                : interests
                    ? [interests]
                    : [],
            bio,
            profilePhotos: uploadedPhotos,
            profileStatus: "pending_verification",
        });
    }
    /* ================= UPDATE ================= */
    else {
        if (username && username !== profile.username) {
            throw new AppError_1.AppError("Username cannot be changed", 400);
        }
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const age = calculateAge(dob);
            if (age < 18) {
                throw new AppError_1.AppError("Minimum age is 18", 403);
            }
            profile.dateOfBirth = dob;
        }
        if (bio !== undefined)
            profile.bio = bio;
        if (interests !== undefined) {
            profile.interests = Array.isArray(interests)
                ? interests
                : [interests];
        }
        if (files && files.length > 0) {
            profile.profilePhotos = uploadedPhotos;
        }
        if (profile.profileStatus === "rejected") {
            profile.profileStatus = "pending_verification";
        }
        await profile.save();
    }
    /* ================= ACTIVATE USER ================= */
    if (isFirstSubmission) {
        const user = await User_1.default.findById(userId);
        if (!user) {
            throw new AppError_1.AppError("User not found", 404);
        }
        if (user.status === "pending_profile") {
            user.status = "active";
            await user.save();
        }
    }
    res.status(200).json({
        message: "Profile saved successfully",
        profileStatus: profile.profileStatus,
        profile,
    });
};
exports.upsertProfile = upsertProfile;
/* ================= GET PROFILE ================= */
const getMyProfile = async (req, res) => {
    const userId = req.user.id;
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (!profile) {
        profile = await userProfile_model_1.UserProfile.create({
            userId,
            username: "",
            bio: "",
            interests: [],
            profilePhotos: [],
            profileStatus: "incomplete",
        });
    }
    const age = profile.dateOfBirth
        ? calculateAge(new Date(profile.dateOfBirth))
        : null;
    res.json({
        ...profile.toObject(),
        age,
    });
};
exports.getMyProfile = getMyProfile;
