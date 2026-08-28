import { Types } from "mongoose";
import { ulid } from "ulid";
import { FaceVerificationEvidence, FaceVerificationEvidenceDocument } from "../models/faceVerificationEvidence.model";
import { FACE_VERIFICATION_EVIDENCE_DELETION_CLAIM_TTL_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "../services/profile/faceVerification.constants";

export class FaceVerificationEvidenceRepository {
  findSlot(sessionId: Types.ObjectId, challengeIndex: number) { return FaceVerificationEvidence.findOne({ sessionId, challengeIndex }).exec(); }
  createReservation(input: Pick<FaceVerificationEvidenceDocument, "evidenceReference" | "sessionId" | "userId" | "profileId" | "challengeIndex" | "challenge" | "cloudinaryPublicId">) { return FaceVerificationEvidence.create({ ...input, status: "UPLOADING", cloudinaryResourceType: "image", cleanupAfter: new Date(Date.now() + FACE_VERIFICATION_SHORT_CLEANUP_MS) }); }
  finalizeStored(id: Types.ObjectId, input: { mimeType: string; bytes: number; format: string; captureReceivedAt: Date }) { return FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "UPLOADING" }, { $set: { status: "STORED", ...input }, $unset: { cleanupAfter: 1 } }, { new: true }).exec(); }
  setCleanupForSession(sessionId: Types.ObjectId, cleanupAfter: Date) { return FaceVerificationEvidence.updateMany({ sessionId, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] } }, { $min: { cleanupAfter } }).exec(); }
  bindSessionEvidence(sessionId: Types.ObjectId, requestId: Types.ObjectId) { return FaceVerificationEvidence.updateMany({ sessionId, verificationRequestId: { $exists: false } }, { $set: { verificationRequestId: requestId } }).exec(); }
  async setRetentionForRequest(requestId: Types.ObjectId, cleanupAfter: Date) {
    await FaceVerificationEvidence.updateMany({ verificationRequestId: requestId, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] } }, { $min: { cleanupAfter } }).exec();
    return FaceVerificationEvidence.updateMany({ verificationRequestId: requestId, status: "DELETE_PENDING", cleanupAfter: { $gt: new Date() }, deletedAt: { $exists: false } }, { $set: { status: "STORED" }, $unset: { deletionClaimToken: 1, deletionClaimedAt: 1 } }).exec();
  }
  countStored(sessionId: Types.ObjectId) { return FaceVerificationEvidence.countDocuments({ sessionId, status: "STORED" }).exec(); }
  listStoredForSession(sessionId: Types.ObjectId) { return FaceVerificationEvidence.find({ sessionId, status: "STORED" }).sort({ challengeIndex: 1, _id: 1 }).exec(); }
  listDueForCleanup(now: Date, limit = 50) { return FaceVerificationEvidence.find({ status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] }, cleanupAfter: { $lte: now } }).sort({ cleanupAfter: 1 }).limit(limit).exec(); }
  claimDueForDeletion(id: Types.ObjectId, now: Date) {
    const staleBefore = new Date(now.getTime() - FACE_VERIFICATION_EVIDENCE_DELETION_CLAIM_TTL_MS);
    const token = ulid();
    return FaceVerificationEvidence.findOneAndUpdate(
      {
        _id: id, cleanupAfter: { $lte: now }, deletedAt: { $exists: false },
        $or: [
          { status: { $in: ["UPLOADING", "STORED"] } },
          { status: "DELETE_PENDING", $or: [{ deletionClaimedAt: { $exists: false } }, { deletionClaimedAt: { $lte: staleBefore } }] },
        ],
      },
      { $set: { status: "DELETE_PENDING", deletionClaimToken: token, deletionClaimedAt: now } },
      { new: true },
    ).exec();
  }
  markDeleted(id: Types.ObjectId, now: Date, deletionClaimToken: string) { return FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "DELETE_PENDING", deletionClaimToken, deletedAt: { $exists: false } }, { $set: { status: "DELETED", deletedAt: now }, $unset: { deletionClaimToken: 1, deletionClaimedAt: 1 } }, { new: true }).exec(); }
  releaseDeletionClaim(id: Types.ObjectId, deletionClaimToken: string) { return FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "DELETE_PENDING", deletionClaimToken, deletedAt: { $exists: false } }, { $set: { status: "STORED" }, $unset: { deletionClaimToken: 1, deletionClaimedAt: 1 } }, { new: true }).exec(); }
}
export const faceVerificationEvidenceRepository = new FaceVerificationEvidenceRepository();
