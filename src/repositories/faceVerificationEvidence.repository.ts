import { Types } from "mongoose";
import { FaceVerificationEvidence, FaceVerificationEvidenceDocument } from "../models/faceVerificationEvidence.model";
import { FACE_VERIFICATION_SHORT_CLEANUP_MS } from "../services/profile/faceVerification.constants";

export class FaceVerificationEvidenceRepository {
  findSlot(sessionId: Types.ObjectId, challengeIndex: number) { return FaceVerificationEvidence.findOne({ sessionId, challengeIndex }).exec(); }
  createReservation(input: Pick<FaceVerificationEvidenceDocument, "evidenceReference" | "sessionId" | "userId" | "profileId" | "challengeIndex" | "challenge" | "cloudinaryPublicId">) { return FaceVerificationEvidence.create({ ...input, status: "UPLOADING", cloudinaryResourceType: "image", cleanupAfter: new Date(Date.now() + FACE_VERIFICATION_SHORT_CLEANUP_MS) }); }
  finalizeStored(id: Types.ObjectId, input: { mimeType: string; bytes: number; format: string; captureReceivedAt: Date }) { return FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "UPLOADING" }, { $set: { status: "STORED", ...input }, $unset: { cleanupAfter: 1 } }, { new: true }).exec(); }
  setCleanupForSession(sessionId: Types.ObjectId, cleanupAfter: Date) { return FaceVerificationEvidence.updateMany({ sessionId, status: { $in: ["UPLOADING", "STORED"] } }, { $set: { cleanupAfter, status: "DELETE_PENDING" } }).exec(); }
  bindSessionEvidence(sessionId: Types.ObjectId, requestId: Types.ObjectId) { return FaceVerificationEvidence.updateMany({ sessionId, verificationRequestId: { $exists: false } }, { $set: { verificationRequestId: requestId } }).exec(); }
  setRetentionForRequest(requestId: Types.ObjectId, cleanupAfter: Date) { return FaceVerificationEvidence.updateMany({ verificationRequestId: requestId, status: { $in: ["UPLOADING", "STORED"] } }, { $set: { cleanupAfter, status: "DELETE_PENDING" } }).exec(); }
  countStored(sessionId: Types.ObjectId) { return FaceVerificationEvidence.countDocuments({ sessionId, status: "STORED" }).exec(); }
  listDueForCleanup(now: Date, limit = 50) { return FaceVerificationEvidence.find({ status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] }, cleanupAfter: { $lte: now } }).sort({ cleanupAfter: 1 }).limit(limit).exec(); }
  markDeleted(id: Types.ObjectId, now: Date) { return FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: { $ne: "DELETED" } }, { $set: { status: "DELETED", deletedAt: now } }, { new: true }).exec(); }
}
export const faceVerificationEvidenceRepository = new FaceVerificationEvidenceRepository();
