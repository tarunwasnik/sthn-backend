"use strict";
// backend/src/middlewares/upload.middleware.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFaceVerificationImageBytes = exports.faceVerificationCaptureUpload = exports.chatImageUpload = exports.chatDocumentUpload = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const faceVerificationEvidenceValidation_service_1 = require("../services/profile/faceVerificationEvidenceValidation.service");
const storage = multer_1.default.memoryStorage();
/* ======================================================
   DOCUMENT MIME TYPES
====================================================== */
const documentMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "application/json",
    "application/xml",
    "text/xml",
    "text/html",
    "text/css",
    "application/javascript",
    "text/javascript",
    "application/typescript",
    "text/typescript",
    "text/x-python",
    "application/x-python-code",
    "application/x-httpd-php",
    "application/x-sh",
    "application/rtf",
    "text/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
]);
/* ======================================================
   DOCUMENT EXTENSIONS
====================================================== */
const documentExtensions = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
    ".json",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".py",
    ".php",
    ".sh",
    ".rtf",
    ".odt",
    ".ods",
    ".odp",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
]);
/* ======================================================
   IMAGE MIME TYPES
====================================================== */
const imageMimeTypes = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
]);
/* ======================================================
   IMAGE EXTENSIONS
====================================================== */
const imageExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
    ".avif",
]);
/* ======================================================
   DOCUMENT FILTER
====================================================== */
const documentFileFilter = (_req, file, cb) => {
    const extension = path_1.default.extname(file.originalname).toLowerCase();
    const mimeAllowed = documentMimeTypes.has(file.mimetype);
    const extensionAllowed = documentExtensions.has(extension);
    if (mimeAllowed || extensionAllowed) {
        return cb(null, true);
    }
    return cb(new Error(`Unsupported document type (${extension || file.mimetype}).`));
};
/* ======================================================
   IMAGE FILTER
====================================================== */
const imageFileFilter = (_req, file, cb) => {
    const extension = path_1.default.extname(file.originalname).toLowerCase();
    const mimeAllowed = imageMimeTypes.has(file.mimetype);
    const extensionAllowed = imageExtensions.has(extension);
    if (mimeAllowed || extensionAllowed) {
        return cb(null, true);
    }
    return cb(new Error(`Unsupported image type (${extension || file.mimetype}).`));
};
/* ======================================================
   GENERIC UPLOADER
====================================================== */
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});
/* ======================================================
   CHAT DOCUMENT UPLOADER
====================================================== */
exports.chatDocumentUpload = (0, multer_1.default)({
    storage,
    fileFilter: documentFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 20,
    },
});
/* ======================================================
   CHAT IMAGE UPLOADER
====================================================== */
exports.chatImageUpload = (0, multer_1.default)({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 20,
    },
});
const faceEvidenceMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
exports.faceVerificationCaptureUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, faceEvidenceMimeTypes.has(file.mimetype)),
});
const assertFaceVerificationImageBytes = (file) => {
    (0, faceVerificationEvidenceValidation_service_1.assertFaceVerificationImageBuffer)(file.buffer);
};
exports.assertFaceVerificationImageBytes = assertFaceVerificationImageBytes;
