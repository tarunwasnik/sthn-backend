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
/* ================= UTIL ================= */
const calculateAge = (dob) => {
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};
/* ================= CREATE / UPDATE PROFILE ================= */
exports.upsertProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
    const { username, dateOfBirth, interests, bio, profilePhotos, avatar, cover, } = req.body;
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    const isFirstSubmission = !profile;
    /* ================= VALIDATION ================= */
    if (!profilePhotos || profilePhotos.length < 2 || profilePhotos.length > 6) {
        throw new AppError_1.AppError("Profile must have between 2 and 6 photos", 400);
    }
    if (!avatar) {
        throw new AppError_1.AppError("Avatar is required", 400);
    }
    if (!cover) {
        throw new AppError_1.AppError("Cover is required", 400);
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
            avatar,
            cover,
            profilePhotos,
            profileStatus: "pending_verification",
            verificationSubmittedAt: new Date(),
        });
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
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const age = calculateAge(dob);
            if (age < 18) {
                throw new AppError_1.AppError("Minimum age is 18", 403);
            }
            profile.dateOfBirth = dob;
        }
        if (bio !== undefined) {
            profile.bio = bio;
        }
        if (interests !== undefined) {
            profile.interests = Array.isArray(interests) ? interests : [interests];
        }
        if (profilePhotos && Array.isArray(profilePhotos)) {
            if (profilePhotos.length < 2 || profilePhotos.length > 6) {
                throw new AppError_1.AppError("Profile must have 2–6 photos", 400);
            }
            profile.profilePhotos = profilePhotos;
        }
        if (avatar !== undefined) {
            profile.avatar = avatar;
        }
        if (cover !== undefined) {
            profile.cover = cover;
        }
        if (profile.profileStatus === "rejected") {
            profile.profileStatus = "pending_verification";
            profile.rejectionReason = "";
            profile.verificationSubmittedAt = new Date();
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
});
/* ================= GET PROFILE ================= */
exports.getMyProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
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
        ? calculateAge(new Date(profile.dateOfBirth))
        : null;
    res.json({
        ...profile.toObject(),
        age,
    });
});
/* ================= EDIT PROFILE ================= */
exports.updateMyProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = req.user.id;
    const { bio, interests, dateOfBirth, profilePhotos, avatar, cover } = req.body;
    const profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (!profile) {
        throw new AppError_1.AppError("Profile not found", 404);
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
        profile.bio = bio;
    }
    if (interests !== undefined) {
        profile.interests = Array.isArray(interests) ? interests : [interests];
    }
    if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        const age = calculateAge(dob);
        if (age < 18) {
            throw new AppError_1.AppError("Minimum age is 18", 403);
        }
        profile.dateOfBirth = dob;
    }
    if (profilePhotos && Array.isArray(profilePhotos)) {
        if (profilePhotos.length < 2 || profilePhotos.length > 20) {
            throw new AppError_1.AppError("Profile must have 2–6 photos", 400);
        }
        profile.profilePhotos = profilePhotos;
    }
    if (avatar !== undefined) {
        profile.avatar = avatar;
    }
    if (cover !== undefined) {
        profile.cover = cover;
    }
    if (profile.profileStatus === "rejected") {
        profile.profileStatus = "pending_verification";
        profile.rejectionReason = "";
        profile.verificationSubmittedAt = new Date();
    }
    await profile.save();
    res.status(200).json({
        message: "Profile updated successfully",
        profile,
    });
});
