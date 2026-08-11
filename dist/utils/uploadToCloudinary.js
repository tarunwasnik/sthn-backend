"use strict";
// backend/src/utils/uploadToCloudinary.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = void 0;
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const uploadToCloudinary = (buffer, folder, resourceType = "auto") => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.default.uploader.upload_stream({
            folder,
            resource_type: resourceType,
        }, (error, result) => {
            if (error) {
                return reject(error);
            }
            if (!result) {
                return reject(new Error("Cloudinary upload failed."));
            }
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
                resource_type: result.resource_type,
                bytes: result.bytes,
                format: result.format,
                original_filename: result.original_filename,
            });
        });
        stream.end(buffer);
    });
};
exports.uploadToCloudinary = uploadToCloudinary;
