"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFaceVerificationImageBuffer = exports.mimeTypeForFaceVerificationFormat = exports.detectFaceVerificationImageFormat = exports.normalizeFaceVerificationFormat = exports.normalizeFaceVerificationMimeType = void 0;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const normalizeFaceVerificationMimeType = (value) => {
    if (typeof value !== "string")
        return null;
    const mimeType = value.split(";", 1)[0].trim().toLowerCase();
    if (mimeType === "image/jpeg" || mimeType === "image/jpg")
        return "image/jpeg";
    if (mimeType === "image/png")
        return "image/png";
    if (mimeType === "image/webp")
        return "image/webp";
    return null;
};
exports.normalizeFaceVerificationMimeType = normalizeFaceVerificationMimeType;
const normalizeFaceVerificationFormat = (value) => {
    if (typeof value !== "string")
        return null;
    const format = value.trim().toLowerCase();
    if (format === "jpg" || format === "jpeg")
        return "jpeg";
    if (format === "png")
        return "png";
    if (format === "webp")
        return "webp";
    return null;
};
exports.normalizeFaceVerificationFormat = normalizeFaceVerificationFormat;
const detectFaceVerificationImageFormat = (buffer) => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        return "jpeg";
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE))
        return "png";
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
        return "webp";
    return null;
};
exports.detectFaceVerificationImageFormat = detectFaceVerificationImageFormat;
const mimeTypeForFaceVerificationFormat = (format) => (format === "jpeg" ? "image/jpeg" : `image/${format}`);
exports.mimeTypeForFaceVerificationFormat = mimeTypeForFaceVerificationFormat;
const assertFaceVerificationImageBuffer = (buffer) => {
    const format = (0, exports.detectFaceVerificationImageFormat)(buffer);
    if (!format)
        throw new Error("Invalid face verification image content.");
    return format;
};
exports.assertFaceVerificationImageBuffer = assertFaceVerificationImageBuffer;
