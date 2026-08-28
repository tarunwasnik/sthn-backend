"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParticipantSubmission = createParticipantSubmission;
exports.getParticipantInvestigation = getParticipantInvestigation;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const chat_model_1 = require("../models/chat.model");
const dispute_model_1 = require("../models/dispute.model");
const disputeAdminRequest_model_1 = require("../models/disputeAdminRequest.model");
const disputeInvestigationSubmission_model_1 = require("../models/disputeInvestigationSubmission.model");
const disputeDirectEvidence_model_1 = require("../models/disputeDirectEvidence.model");
const AppError_1 = require("../utils/AppError");
const page = (value) => Math.max(1, Number.parseInt(String(value ?? "1"), 10) || 1);
const limit = (value) => Math.min(100, Math.max(1, Number.parseInt(String(value ?? "25"), 10) || 25));
const actorRole = (booking, id) => String(booking.userId) === id ? "CUSTOMER" : String(booking.creatorId) === id ? "CREATOR" : null;
const safeSubmission = (item) => ({ submissionReference: item.submissionReference, branch: item.branch, kind: item.kind, text: item.text ?? null, evidence: item.evidence.map((e) => ({ evidenceReference: e.evidenceReference, type: e.type, url: e.url, fileName: e.fileName, mimeType: e.mimeType, fileSize: e.fileSize, caption: e.caption ?? null })), createdAt: item.createdAt, sharedWithCounterpartyAt: item.sharedWithCounterpartyAt ?? null });
const safeRequest = (item) => ({ requestReference: item.requestReference, target: item.target, text: item.text, createdAt: item.createdAt });
async function participant(disputeId, userId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId);
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    const booking = await booking_model_1.Booking.findById(dispute.bookingId);
    if (!booking)
        throw new AppError_1.AppError("Linked booking not found", 404);
    const role = actorRole(booking, userId);
    if (!role)
        throw new AppError_1.AppError("Access denied", 403);
    return { dispute, booking, role };
}
async function createParticipantSubmission(req, res) {
    if (!req.user)
        throw new AppError_1.AppError("Unauthorized", 401);
    const { dispute, booking, role } = await participant(req.params.disputeId, req.user.id);
    if (dispute.status !== "OPEN")
        throw new AppError_1.AppError("Investigation submissions require an OPEN dispute", 409);
    if ((role === "CUSTOMER" ? dispute.customerInput.state : dispute.creatorInput.state) !== "OPEN")
        throw new AppError_1.AppError("Your investigation input is closed", 409);
    const { kind, text, evidence } = req.body;
    if (kind !== "STATEMENT" && kind !== "CLARIFICATION" && kind !== "EVIDENCE")
        throw new AppError_1.AppError("Invalid submission kind", 400);
    const cleanText = typeof text === "string" ? text.trim() : "";
    if (cleanText.length > 4000 || (!cleanText && (!Array.isArray(evidence) || evidence.length === 0)))
        throw new AppError_1.AppError("A statement or evidence is required", 400);
    if (!Array.isArray(evidence) || evidence.length > 10) {
        if (evidence !== undefined)
            throw new AppError_1.AppError("evidence must contain at most 10 attachment references", 400);
    }
    const evidenceItems = [];
    for (const raw of evidence ?? []) {
        if (!raw || typeof raw !== "object" || typeof raw.chatMessageId !== "string" || !mongoose_1.default.Types.ObjectId.isValid(raw.chatMessageId))
            throw new AppError_1.AppError("Invalid evidence attachment reference", 400);
        const chat = await chat_model_1.Chat.findOne({ _id: raw.chatMessageId, bookingId: booking._id, senderId: req.user.id, isDeleted: false }).lean();
        if (!chat?.attachment || (chat.type !== "image" && chat.type !== "document"))
            throw new AppError_1.AppError("Evidence must reference your existing booking image or document attachment", 400);
        const caption = typeof raw.caption === "string" ? raw.caption.trim() : undefined;
        if (caption && caption.length > 500)
            throw new AppError_1.AppError("Evidence caption is too long", 400);
        evidenceItems.push({ evidenceReference: `DISPUTE_EVIDENCE_${new mongoose_1.default.Types.ObjectId().toString().toUpperCase()}`, type: chat.type === "image" ? "IMAGE" : "DOCUMENT", url: chat.attachment.url, publicId: chat.attachment.publicId, fileName: chat.attachment.originalFileName || chat.attachment.fileName, mimeType: chat.attachment.mimeType, fileSize: chat.attachment.fileSize, ...(caption ? { caption } : {}) });
    }
    const created = await disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.create({ disputeId: dispute._id, bookingId: booking._id, submittedBy: req.user.id, branch: role, kind, ...(cleanText ? { text: cleanText } : {}), evidence: evidenceItems });
    return res.status(201).json({ submission: safeSubmission(created) });
}
async function getParticipantInvestigation(req, res) {
    if (!req.user)
        throw new AppError_1.AppError("Unauthorized", 401);
    const { dispute, role } = await participant(req.params.disputeId, req.user.id);
    const take = limit(req.query.limit);
    const current = page(req.query.page);
    const own = role === "CUSTOMER" ? "CUSTOMER" : "CREATOR";
    const other = own === "CUSTOMER" ? "CREATOR" : "CUSTOMER";
    const [submissions, requests, directEvidence, total] = await Promise.all([
        disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.find({ disputeId: dispute._id, $or: [{ branch: own }, { branch: other, sharedWithCounterpartyAt: { $exists: true } }] }).sort({ createdAt: 1, _id: 1 }).skip((current - 1) * take).limit(take).lean(),
        disputeAdminRequest_model_1.DisputeAdminRequest.find({ disputeId: dispute._id, target: { $in: [own, "BOTH"] } }).sort({ createdAt: 1, _id: 1 }).limit(take).lean(),
        disputeDirectEvidence_model_1.DisputeDirectEvidence.find({ disputeId: dispute._id, $or: [{ source: own }, { source: "ADMIN", audience: { $in: [own, "BOTH"] } }] }).sort({ createdAt: 1, _id: 1 }).limit(take).lean(),
        disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.countDocuments({ disputeId: dispute._id, $or: [{ branch: own }, { branch: other, sharedWithCounterpartyAt: { $exists: true } }] }),
    ]);
    return res.json({ dispute: { disputeId: String(dispute._id), status: dispute.status, input: { state: own === "CUSTOMER" ? dispute.customerInput.state : dispute.creatorInput.state } }, submissions: submissions.map(safeSubmission), directEvidence: directEvidence.map((item) => ({ evidenceReference: item.evidenceReference, source: item.source, type: item.type, url: item.url, fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, note: item.note ?? null, createdAt: item.createdAt })), adminRequests: requests.map(safeRequest), pagination: { page: current, limit: take, total } });
}
