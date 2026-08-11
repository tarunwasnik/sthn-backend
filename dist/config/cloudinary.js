"use strict";
//backend/src/config/cloudinary.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPublicId = void 0;
const cloudinary_1 = require("cloudinary");
/* ================= CONFIG ================= */
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
/* ================= EXTRACT PUBLIC ID ================= */
const extractPublicId = (url) => {
    try {
        const parts = url.split("/upload/")[1];
        if (!parts)
            return null;
        // remove version if exists (v123...)
        const withoutVersion = parts.replace(/^v\d+\//, "");
        // remove file extension
        return withoutVersion.replace(/\.[^/.]+$/, "");
    }
    catch {
        return null;
    }
};
exports.extractPublicId = extractPublicId;
exports.default = cloudinary_1.v2;
