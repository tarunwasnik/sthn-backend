"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadAdminDocument = exports.uploadAdminImage = exports.uploadParticipantDocument = exports.uploadParticipantImage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const booking_model_1 = require("../models/booking.model");
const dispute_model_1 = require("../models/dispute.model");
const disputeDirectEvidence_model_1 = require("../models/disputeDirectEvidence.model");
const uploadToCloudinary_1 = require("../utils/uploadToCloudinary");
const AppError_1 = require("../utils/AppError");
const role = (b, id) => String(b.userId) === id ? "CUSTOMER" : String(b.creatorId) === id ? "CREATOR" : null;
async function upload(req, res, type, admin = false) { const actor = req.user; if (!actor)
    throw new AppError_1.AppError("Unauthorized", 401); if (!req.file)
    throw new AppError_1.AppError("A file is required", 400); if (!mongoose_1.default.Types.ObjectId.isValid(req.params.disputeId))
    throw new AppError_1.AppError("Invalid disputeId", 400); const dispute = await dispute_model_1.Dispute.findById(req.params.disputeId); if (!dispute)
    throw new AppError_1.AppError("Dispute not found", 404); if (dispute.status !== "OPEN")
    throw new AppError_1.AppError("Evidence uploads require an OPEN dispute", 409); const booking = await booking_model_1.Booking.findById(dispute.bookingId); if (!booking)
    throw new AppError_1.AppError("Linked booking not found", 404); const branch = (admin ? "ADMIN" : role(booking, actor.id)); if (!branch)
    throw new AppError_1.AppError("Access denied", 403); if (!admin && (branch === "CUSTOMER" ? dispute.customerInput.state : dispute.creatorInput.state) !== "OPEN")
    throw new AppError_1.AppError("Your investigation input is closed", 409); const requestedAudience = req.body.audience; if (admin && requestedAudience !== "ADMIN_ONLY" && requestedAudience !== "CUSTOMER" && requestedAudience !== "CREATOR" && requestedAudience !== "BOTH")
    throw new AppError_1.AppError("Admin evidence audience is required", 400); const audience = admin ? requestedAudience : undefined; const note = typeof req.body.note === "string" ? req.body.note.trim() : undefined; if (note && note.length > 500)
    throw new AppError_1.AppError("Evidence note is too long", 400); const uploaded = await (0, uploadToCloudinary_1.uploadToCloudinary)(req.file.buffer, type === "IMAGE" ? "chat_images" : "chat_documents", type === "IMAGE" ? "image" : "raw"); try {
    const item = await disputeDirectEvidence_model_1.DisputeDirectEvidence.create({ disputeId: dispute._id, bookingId: booking._id, source: branch, uploadedBy: actor.id, type, ...(admin ? { audience } : {}), url: uploaded.secure_url, publicId: uploaded.public_id, fileName: req.file.originalname, mimeType: req.file.mimetype, fileSize: req.file.size, ...(note ? { note } : {}) });
    return res.status(201).json({ evidence: { evidenceReference: item.evidenceReference, source: item.source, type: item.type, audience: item.audience ?? null, url: item.url, fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, note: item.note ?? null, createdAt: item.createdAt } });
}
catch (error) {
    await cloudinary_1.default.uploader.destroy(uploaded.public_id, { resource_type: type === "IMAGE" ? "image" : "raw" }).catch(() => undefined);
    throw error;
} }
const uploadParticipantImage = (req, res) => upload(req, res, "IMAGE");
exports.uploadParticipantImage = uploadParticipantImage;
const uploadParticipantDocument = (req, res) => upload(req, res, "DOCUMENT");
exports.uploadParticipantDocument = uploadParticipantDocument;
const uploadAdminImage = (req, res) => upload(req, res, "IMAGE", true);
exports.uploadAdminImage = uploadAdminImage;
const uploadAdminDocument = (req, res) => upload(req, res, "DOCUMENT", true);
exports.uploadAdminDocument = uploadAdminDocument;
