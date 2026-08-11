"use strict";
//backend/src/controllers/creatorProfile.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMyCreatorProfile = exports.getMyCreatorProfile = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const catchAsync_1 = require("../utils/catchAsync");
const AppError_1 = require("../utils/AppError");
const cloudinary_1 = require("cloudinary");
const extractPublicId_1 = require("../utils/extractPublicId");
/* ================= GET CREATOR PROFILE ================= */
exports.getMyCreatorProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = new mongoose_1.default.Types.ObjectId(req.user.id);
    const profile = await creatorProfile_model_1.CreatorProfile.findOne({ userId });
    if (!profile) {
        throw new AppError_1.AppError("Creator profile not found", 404);
    }
    res.status(200).json(profile);
});
/* ================= UPDATE CREATOR PROFILE ================= */
exports.updateMyCreatorProfile = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const userId = new mongoose_1.default.Types.ObjectId(req.user.id);
    const { displayName, avatarUrl, coverUrl, bio, languages, categories, city, country, media, } = req.body;
    const profile = await creatorProfile_model_1.CreatorProfile.findOne({ userId });
    if (!profile) {
        throw new AppError_1.AppError("Creator profile not found", 404);
    }
    /* 🔥 CLOUDINARY CLEANUP */
    if (avatarUrl !== undefined &&
        profile.avatarUrl &&
        avatarUrl !== profile.avatarUrl) {
        try {
            const publicId = (0, extractPublicId_1.extractPublicId)(profile.avatarUrl);
            if (publicId)
                await cloudinary_1.v2.uploader.destroy(publicId);
        }
        catch (e) {
            console.error("Avatar delete failed:", e);
        }
    }
    if (coverUrl !== undefined &&
        profile.coverUrl &&
        coverUrl !== profile.coverUrl) {
        try {
            const publicId = (0, extractPublicId_1.extractPublicId)(profile.coverUrl);
            if (publicId)
                await cloudinary_1.v2.uploader.destroy(publicId);
        }
        catch (e) {
            console.error("Cover delete failed:", e);
        }
    }
    // 🔥 MEDIA (STRICT SAME AS SERVICES)
    if (media !== undefined) {
        const oldMedia = profile.media || [];
        const newMedia = Array.isArray(media) ? media : [];
        const removedMedia = oldMedia.filter((oldUrl) => !newMedia.includes(oldUrl));
        for (const url of removedMedia) {
            try {
                const publicId = (0, extractPublicId_1.extractPublicId)(url);
                if (publicId) {
                    await cloudinary_1.v2.uploader.destroy(publicId);
                }
            }
            catch (err) {
                console.error("Media delete failed:", err);
            }
        }
    }
    /* ================= UPDATE ================= */
    if (displayName !== undefined)
        profile.displayName = displayName;
    if (avatarUrl !== undefined)
        profile.avatarUrl = avatarUrl;
    if (coverUrl !== undefined)
        profile.coverUrl = coverUrl;
    if (bio !== undefined)
        profile.bio = bio;
    if (languages !== undefined)
        profile.languages = languages;
    if (categories !== undefined)
        profile.categories = categories;
    if (city !== undefined)
        profile.city = city;
    if (country !== undefined)
        profile.country = country;
    if (media !== undefined)
        profile.media = media;
    await profile.save();
    res.status(200).json({
        message: "Creator profile updated",
        profile,
    });
});
