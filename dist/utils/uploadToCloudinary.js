"use strict";
// backend/src/utils/uploadToCloudinary.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = void 0;
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.default.uploader.upload_stream({ folder: "user_profiles" }, (error, result) => {
            if (error)
                return reject(error);
            resolve({
                secure_url: result?.secure_url || "",
            });
        });
        stream.end(buffer);
    });
};
exports.uploadToCloudinary = uploadToCloudinary;
