"use strict";
// backend/src/controllers/profile.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMyProfile = exports.getMyProfile = exports.upsertProfile = void 0;
const userProfile_model_1 = require("../models/userProfile.model");
const User_1 = __importDefault(require("../models/User"));
const AppError_1 = require("../utils/AppError");
const catchAsync_1 = require("../utils/catchAsync");
const cloudinary_1 = require("cloudinary");
const extractPublicId_1 = require("../utils/extractPublicId");
const calculateAge_1 = require("../utils/calculateAge");
const legacyMobileContactMigration_service_1 = require("../services/profile/legacyMobileContactMigration.service");
const profileVerificationRequest_service_1 = require("../services/profile/profileVerificationRequest.service");
const profileVerificationJob_service_1 = require("../services/profile/profileVerificationJob.service");
const faceVerificationSession_service_1 = require("../services/profile/faceVerificationSession.service");
const requireText = (value, field, maxLength) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
        throw new AppError_1.AppError(`Invalid ${field}`, 400);
    }
    return value.trim();
};
const optionalText = (value, field, maxLength) => {
    if (value === undefined)
        return undefined;
    return requireText(value, field, maxLength);
};
const normalizeStringArray = (value, field, maxItems) => {
    if (!Array.isArray(value) || value.length > maxItems) {
        throw new AppError_1.AppError(`Invalid ${field}`, 400);
    }
    const normalized = value.map((item) => requireText(item, field, 80));
    return [...new Set(normalized)];
};
const parseDateOfBirth = (value) => {
    if (typeof value !== "string" || !value.trim())
        throw new AppError_1.AppError("Invalid date of birth", 400);
    const dateOfBirth = new Date(value);
    if (Number.isNaN(dateOfBirth.getTime()) || (0, calculateAge_1.calculateAge)(dateOfBirth) < 18) {
        throw new AppError_1.AppError("Minimum age is 18", 403);
    }
    return dateOfBirth;
};
const normalizeMobileCountryCode = (value) => {
    const countryCode = requireText(value, "mobile country code", 5);
    if (!/^\+[1-9]\d{0,3}$/.test(countryCode))
        throw new AppError_1.AppError("Invalid mobile country code", 400);
    return countryCode;
};
const normalizeMobileNumber = (value) => {
    const mobileNumber = requireText(value, "mobile number", 15).replace(/[\s-]/g, "");
    if (!/^\d{6,15}$/.test(mobileNumber))
        throw new AppError_1.AppError("Invalid mobile number", 400);
    return mobileNumber;
};
const validateProfilePhotos = (value) => {
    if (!Array.isArray(value) || value.length < 2 || value.length > 6 || value.some((item) => typeof item !== "string" || !item.trim())) {
        throw new AppError_1.AppError("Profile must have between 2 and 6 photos", 400);
    }
    return value;
};
/* ================= CREATE / UPDATE PROFILE ================= */
exports.upsertProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
    await (0, legacyMobileContactMigration_service_1.migrateLegacyProfileMobileContact)(userId);
    const { username, realName, dateOfBirth, mobileCountryCode, mobileNumber, country, city, languages, interests, bio, profilePhotos, avatar, cover, } = req.body;
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    const isFirstSubmission = !profile || profile.profileStatus === "incomplete";
    if (profile?.profileStatus === "pending_verification") {
        throw new AppError_1.AppError("Profile is pending verification and cannot be edited", 409);
    }
    /* ================= VALIDATION ================= */
    const validatedProfilePhotos = validateProfilePhotos(profilePhotos);
    const validatedAvatar = requireText(avatar, "avatar", 2048);
    const validatedCover = requireText(cover, "cover", 2048);
    if (isFirstSubmission) {
        await (0, faceVerificationSession_service_1.requireCompletedFaceSessionForInitialSubmission)({ userId, avatar: validatedAvatar });
    }
    /* ================= CREATE ================= */
    if (!profile || profile.profileStatus === "incomplete") {
        const normalizedUsername = requireText(username, "username", 40).toLowerCase();
        const normalizedRealName = requireText(realName, "real name", 120);
        const dob = parseDateOfBirth(dateOfBirth);
        const normalizedCountryCode = normalizeMobileCountryCode(mobileCountryCode);
        const normalizedMobileNumber = normalizeMobileNumber(mobileNumber);
        const normalizedCountry = requireText(country, "country", 100);
        const normalizedCity = requireText(city, "city", 100);
        const normalizedLanguages = normalizeStringArray(languages, "languages", 12);
        const normalizedBio = requireText(bio, "bio", 2000);
        const existingUsername = await userProfile_model_1.UserProfile.findOne({ username: normalizedUsername });
        if (existingUsername) {
            throw new AppError_1.AppError("Username already taken", 409);
        }
        const firstSubmission = {
            userId,
            username: normalizedUsername,
            realName: normalizedRealName,
            dateOfBirth: dob,
            country: normalizedCountry,
            city: normalizedCity,
            languages: normalizedLanguages,
            interests: Array.isArray(interests)
                ? interests
                : interests
                    ? [interests]
                    : [],
            bio: normalizedBio,
            avatar: validatedAvatar,
            cover: validatedCover,
            profilePhotos: validatedProfilePhotos,
            profileStatus: "pending_verification",
            verificationSubmittedAt: new Date(),
            verificationSubmissionVersion: ((profile?.verificationSubmissionVersion ?? 0) + 1),
        };
        if (profile) {
            Object.assign(profile, firstSubmission);
            await profile.save();
        }
        else {
            profile = await userProfile_model_1.UserProfile.create(firstSubmission);
        }
    }
    else {
        /* ================= UPDATE ================= */
        /* 🔥 CLOUDINARY CLEANUP */
        // Avatar
        if (avatar !== undefined && profile.avatar && avatar !== profile.avatar) {
            try {
                const publicId = (0, extractPublicId_1.extractPublicId)(profile.avatar);
                if (publicId) {
                    await cloudinary_1.v2.uploader.destroy(publicId);
                }
            }
            catch (e) {
                console.error("Avatar delete failed:", e);
            }
        }
        // Cover
        if (cover !== undefined && profile.cover && cover !== profile.cover) {
            try {
                const publicId = (0, extractPublicId_1.extractPublicId)(profile.cover);
                if (publicId) {
                    await cloudinary_1.v2.uploader.destroy(publicId);
                }
            }
            catch (e) {
                console.error("Cover delete failed:", e);
            }
        }
        // 🔥 GALLERY (STRICT SAME AS SERVICES)
        if (profilePhotos !== undefined) {
            const oldPhotos = profile.profilePhotos || [];
            const newPhotos = Array.isArray(profilePhotos) ? profilePhotos : [];
            const removedPhotos = oldPhotos.filter((oldUrl) => !newPhotos.includes(oldUrl));
            for (const url of removedPhotos) {
                try {
                    const publicId = (0, extractPublicId_1.extractPublicId)(url);
                    if (publicId) {
                        await cloudinary_1.v2.uploader.destroy(publicId);
                    }
                }
                catch (err) {
                    console.error("Gallery delete failed:", err);
                }
            }
        }
        /* ================= ORIGINAL LOGIC ================= */
        if (username && username !== profile.username) {
            throw new AppError_1.AppError("Username cannot be changed", 400);
        }
        if (dateOfBirth !== undefined) {
            profile.dateOfBirth = parseDateOfBirth(dateOfBirth);
        }
        if (bio !== undefined) {
            profile.bio = requireText(bio, "bio", 2000);
        }
        if (interests !== undefined) {
            profile.interests = normalizeStringArray(interests, "interests", 20);
        }
        const normalizedRealName = optionalText(realName, "real name", 120);
        if (normalizedRealName !== undefined)
            profile.realName = normalizedRealName;
        const normalizedCountry = optionalText(country, "country", 100);
        if (normalizedCountry !== undefined)
            profile.country = normalizedCountry;
        const normalizedCity = optionalText(city, "city", 100);
        if (normalizedCity !== undefined)
            profile.city = normalizedCity;
        if (languages !== undefined)
            profile.languages = normalizeStringArray(languages, "languages", 12);
        if (profilePhotos !== undefined) {
            profile.profilePhotos = validateProfilePhotos(profilePhotos);
        }
        if (avatar !== undefined) {
            profile.avatar = validatedAvatar;
        }
        if (cover !== undefined) {
            profile.cover = validatedCover;
        }
        if (profile.profileStatus === "rejected") {
            profile.profileStatus = "pending_verification";
            profile.rejectionReason = "";
            profile.verificationSubmittedAt = new Date();
            profile.verificationSubmissionVersion = (profile.verificationSubmissionVersion || 0) + 1;
        }
        await profile.save();
    }
    await (0, faceVerificationSession_service_1.invalidateFaceSessionsForAvatar)(profile);
    if (profile.profileStatus === "pending_verification") {
        const verificationRequest = await (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile);
        await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(verificationRequest.request);
        await (0, faceVerificationSession_service_1.bindCompletedFaceSessionToVerificationRequest)({ profile, requestId: verificationRequest.request._id });
    }
    /* ================= ACTIVATE USER ================= */
    if (isFirstSubmission) {
        const user = await User_1.default.findById(userId);
        if (!user) {
            throw new AppError_1.AppError("User not found", 404);
        }
        if (user.status === "pending_profile") {
            user.status = "active";
        }
        user.mobileCountryCode = normalizeMobileCountryCode(mobileCountryCode);
        user.mobileNumber = normalizeMobileNumber(mobileNumber);
        await user.save();
    }
    res.status(200).json({
        message: "Profile saved successfully",
        profileStatus: profile.profileStatus,
        profile,
    });
});
/* ================= GET PROFILE ================= */
exports.getMyProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
    await (0, legacyMobileContactMigration_service_1.migrateLegacyProfileMobileContact)(userId);
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (!profile) {
        profile = await userProfile_model_1.UserProfile.create({
            userId,
            username: "",
            bio: "",
            interests: [],
            avatar: "",
            cover: "",
            profilePhotos: [],
            profileStatus: "incomplete",
        });
    }
    const age = profile.dateOfBirth
        ? (0, calculateAge_1.calculateAge)(new Date(profile.dateOfBirth))
        : null;
    res.json({
        ...profile.toObject(),
        age,
    });
});
/* ================= EDIT PROFILE ================= */
exports.updateMyProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
    await (0, legacyMobileContactMigration_service_1.migrateLegacyProfileMobileContact)(userId);
    const { realName, bio, interests, dateOfBirth, country, city, languages, profilePhotos, avatar, cover, } = req.body;
    const profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (!profile) {
        throw new AppError_1.AppError("Profile not found", 404);
    }
    if (profile.profileStatus === "pending_verification") {
        throw new AppError_1.AppError("Profile is pending verification and cannot be edited", 409);
    }
    /* 🔥 CLOUDINARY CLEANUP */
    if (avatar !== undefined && profile.avatar && avatar !== profile.avatar) {
        try {
            const publicId = (0, extractPublicId_1.extractPublicId)(profile.avatar);
            if (publicId) {
                await cloudinary_1.v2.uploader.destroy(publicId);
            }
        }
        catch (e) {
            console.error("Avatar delete failed:", e);
        }
    }
    if (cover !== undefined && profile.cover && cover !== profile.cover) {
        try {
            const publicId = (0, extractPublicId_1.extractPublicId)(profile.cover);
            if (publicId) {
                await cloudinary_1.v2.uploader.destroy(publicId);
            }
        }
        catch (e) {
            console.error("Cover delete failed:", e);
        }
    }
    if (profilePhotos && Array.isArray(profile.profilePhotos)) {
        const removed = profile.profilePhotos.filter((img) => !profilePhotos.includes(img));
        for (const img of removed) {
            try {
                const publicId = (0, extractPublicId_1.extractPublicId)(img);
                if (publicId) {
                    await cloudinary_1.v2.uploader.destroy(publicId);
                }
            }
            catch (e) {
                console.error("Gallery delete failed:", e);
            }
        }
    }
    /* ================= ORIGINAL ================= */
    if (bio !== undefined) {
        profile.bio = requireText(bio, "bio", 2000);
    }
    if (interests !== undefined) {
        profile.interests = normalizeStringArray(interests, "interests", 20);
    }
    if (dateOfBirth !== undefined) {
        profile.dateOfBirth = parseDateOfBirth(dateOfBirth);
    }
    const normalizedRealName = optionalText(realName, "real name", 120);
    if (normalizedRealName !== undefined)
        profile.realName = normalizedRealName;
    const normalizedCountry = optionalText(country, "country", 100);
    if (normalizedCountry !== undefined)
        profile.country = normalizedCountry;
    const normalizedCity = optionalText(city, "city", 100);
    if (normalizedCity !== undefined)
        profile.city = normalizedCity;
    if (languages !== undefined)
        profile.languages = normalizeStringArray(languages, "languages", 12);
    if (profilePhotos !== undefined) {
        profile.profilePhotos = validateProfilePhotos(profilePhotos);
    }
    if (avatar !== undefined) {
        profile.avatar = requireText(avatar, "avatar", 2048);
    }
    if (cover !== undefined) {
        profile.cover = requireText(cover, "cover", 2048);
    }
    if (profile.profileStatus === "rejected") {
        profile.profileStatus = "pending_verification";
        profile.rejectionReason = "";
        profile.verificationSubmittedAt = new Date();
        profile.verificationSubmissionVersion = (profile.verificationSubmissionVersion || 0) + 1;
    }
    await profile.save();
    await (0, faceVerificationSession_service_1.invalidateFaceSessionsForAvatar)(profile);
    if (profile.profileStatus === "pending_verification") {
        const verificationRequest = await (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile);
        await (0, profileVerificationJob_service_1.ensureProfileVerificationJob)(verificationRequest.request);
        await (0, faceVerificationSession_service_1.bindCompletedFaceSessionToVerificationRequest)({ profile, requestId: verificationRequest.request._id });
    }
    res.status(200).json({
        message: "Profile updated successfully",
        profile,
    });
});
