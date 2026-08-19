import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Chat } from "../models/chat.model";
import { Dispute } from "../models/dispute.model";
import { DisputeAdminRequest } from "../models/disputeAdminRequest.model";
import { DisputeInvestigationSubmission, IDisputeEvidence } from "../models/disputeInvestigationSubmission.model";
import { DisputeDirectEvidence } from "../models/disputeDirectEvidence.model";
import { AppError } from "../utils/AppError";

type ParticipantRole = "CUSTOMER" | "CREATOR";
type AuthRequest = Request & { user?: { id: string } };
const page = (value: unknown) => Math.max(1, Number.parseInt(String(value ?? "1"), 10) || 1);
const limit = (value: unknown) => Math.min(100, Math.max(1, Number.parseInt(String(value ?? "25"), 10) || 25));
const actorRole = (booking: { userId: unknown; creatorId: unknown }, id: string): ParticipantRole | null => String(booking.userId) === id ? "CUSTOMER" : String(booking.creatorId) === id ? "CREATOR" : null;
const safeSubmission = (item: any) => ({ submissionReference: item.submissionReference, branch: item.branch, kind: item.kind, text: item.text ?? null, evidence: item.evidence.map((e: any) => ({ evidenceReference: e.evidenceReference, type: e.type, url: e.url, fileName: e.fileName, mimeType: e.mimeType, fileSize: e.fileSize, caption: e.caption ?? null })), createdAt: item.createdAt, sharedWithCounterpartyAt: item.sharedWithCounterpartyAt ?? null });
const safeRequest = (item: any) => ({ requestReference: item.requestReference, target: item.target, text: item.text, createdAt: item.createdAt });

async function participant(disputeId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(disputeId)) throw new AppError("Invalid disputeId", 400);
  const dispute = await Dispute.findById(disputeId); if (!dispute) throw new AppError("Dispute not found", 404);
  const booking = await Booking.findById(dispute.bookingId); if (!booking) throw new AppError("Linked booking not found", 404);
  const role = actorRole(booking, userId); if (!role) throw new AppError("Access denied", 403);
  return { dispute, booking, role };
}

export async function createParticipantSubmission(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const { dispute, booking, role } = await participant(req.params.disputeId, req.user.id);
  if (dispute.status !== "OPEN") throw new AppError("Investigation submissions require an OPEN dispute", 409);
  if ((role === "CUSTOMER" ? dispute.customerInput.state : dispute.creatorInput.state) !== "OPEN") throw new AppError("Your investigation input is closed", 409);
  const { kind, text, evidence } = req.body as { kind?: unknown; text?: unknown; evidence?: unknown };
  if (kind !== "STATEMENT" && kind !== "CLARIFICATION" && kind !== "EVIDENCE") throw new AppError("Invalid submission kind", 400);
  const cleanText = typeof text === "string" ? text.trim() : "";
  if (cleanText.length > 4000 || (!cleanText && (!Array.isArray(evidence) || evidence.length === 0))) throw new AppError("A statement or evidence is required", 400);
  if (!Array.isArray(evidence) || evidence.length > 10) { if (evidence !== undefined) throw new AppError("evidence must contain at most 10 attachment references", 400); }
  const evidenceItems: IDisputeEvidence[] = [];
  for (const raw of evidence ?? []) {
    if (!raw || typeof raw !== "object" || typeof (raw as { chatMessageId?: unknown }).chatMessageId !== "string" || !mongoose.Types.ObjectId.isValid((raw as { chatMessageId: string }).chatMessageId)) throw new AppError("Invalid evidence attachment reference", 400);
    const chat = await Chat.findOne({ _id: (raw as { chatMessageId: string }).chatMessageId, bookingId: booking._id, senderId: req.user.id, isDeleted: false }).lean();
    if (!chat?.attachment || (chat.type !== "image" && chat.type !== "document")) throw new AppError("Evidence must reference your existing booking image or document attachment", 400);
    const caption = typeof (raw as { caption?: unknown }).caption === "string" ? (raw as { caption: string }).caption.trim() : undefined;
    if (caption && caption.length > 500) throw new AppError("Evidence caption is too long", 400);
    evidenceItems.push({ evidenceReference: `DISPUTE_EVIDENCE_${new mongoose.Types.ObjectId().toString().toUpperCase()}`, type: chat.type === "image" ? "IMAGE" : "DOCUMENT", url: chat.attachment.url, publicId: chat.attachment.publicId, fileName: chat.attachment.originalFileName || chat.attachment.fileName, mimeType: chat.attachment.mimeType, fileSize: chat.attachment.fileSize, ...(caption ? { caption } : {}) });
  }
  const created = await DisputeInvestigationSubmission.create({ disputeId: dispute._id, bookingId: booking._id, submittedBy: req.user.id, branch: role, kind, ...(cleanText ? { text: cleanText } : {}), evidence: evidenceItems });
  return res.status(201).json({ submission: safeSubmission(created) });
}

export async function getParticipantInvestigation(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const { dispute, role } = await participant(req.params.disputeId, req.user.id); const take = limit(req.query.limit); const current = page(req.query.page);
  const own = role === "CUSTOMER" ? "CUSTOMER" : "CREATOR"; const other = own === "CUSTOMER" ? "CREATOR" : "CUSTOMER";
  const [submissions, requests, directEvidence, total] = await Promise.all([
    DisputeInvestigationSubmission.find({ disputeId: dispute._id, $or: [{ branch: own }, { branch: other, sharedWithCounterpartyAt: { $exists: true } }] }).sort({ createdAt: 1, _id: 1 }).skip((current - 1) * take).limit(take).lean(),
    DisputeAdminRequest.find({ disputeId: dispute._id, target: { $in: [own, "BOTH"] } }).sort({ createdAt: 1, _id: 1 }).limit(take).lean(),
    DisputeDirectEvidence.find({ disputeId: dispute._id, $or: [{ source: own }, { source: "ADMIN", audience: { $in: [own, "BOTH"] } }] }).sort({ createdAt: 1, _id: 1 }).limit(take).lean(),
    DisputeInvestigationSubmission.countDocuments({ disputeId: dispute._id, $or: [{ branch: own }, { branch: other, sharedWithCounterpartyAt: { $exists: true } }] }),
  ]);
  return res.json({ dispute: { disputeId: String(dispute._id), status: dispute.status, input: { state: own === "CUSTOMER" ? dispute.customerInput.state : dispute.creatorInput.state } }, submissions: submissions.map(safeSubmission), directEvidence: directEvidence.map((item) => ({ evidenceReference:item.evidenceReference, source:item.source, type:item.type, url:item.url, fileName:item.fileName, mimeType:item.mimeType, fileSize:item.fileSize, note:item.note??null, createdAt:item.createdAt })), adminRequests: requests.map(safeRequest), pagination: { page: current, limit: take, total } });
}
