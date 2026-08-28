import { Types } from "mongoose";
import { FaceVerificationSession, FaceVerificationSessionDocument } from "../models/faceVerificationSession.model";

export class FaceVerificationSessionRepository {
  findCurrent(profileId: Types.ObjectId) { return FaceVerificationSession.findOne({ profileId, isCurrent: true }).exec(); }
  findOwned(sessionReference: string, userId: Types.ObjectId) { return FaceVerificationSession.findOne({ sessionReference, userId }).exec(); }
  findById(id: Types.ObjectId) { return FaceVerificationSession.findById(id).exec(); }
  findCurrentCompletedBoundToRequest(input: { requestId: Types.ObjectId; profileId: Types.ObjectId; userId: Types.ObjectId }) {
    return FaceVerificationSession.findOne({
      verificationRequestId: input.requestId,
      profileId: input.profileId,
      userId: input.userId,
      isCurrent: true,
      status: "CAPTURE_COMPLETE",
      requiredCaptureCount: 5,
      acceptedCaptureCount: 5,
    }).exec();
  }
  create(input: Pick<FaceVerificationSessionDocument, "sessionReference" | "userId" | "profileId" | "profileSubmissionVersion" | "avatarFingerprint" | "challenges" | "expiresAt">) {
    return FaceVerificationSession.create({ ...input, status: "CREATED", isCurrent: true, requiredCaptureCount: 5, acceptedCaptureCount: 0, startedAt: new Date() });
  }
  listExpiredCurrent(now: Date) { return FaceVerificationSession.find({ isCurrent: true, status: { $in: ["CREATED", "CAPTURING"] }, expiresAt: { $lte: now } }).exec(); }
  expire(sessionId: Types.ObjectId, now: Date, cleanupAfter: Date) {
    return FaceVerificationSession.findOneAndUpdate({ _id: sessionId, isCurrent: true, status: { $in: ["CREATED", "CAPTURING"] }, expiresAt: { $lte: now } }, { $set: { status: "EXPIRED", isCurrent: false, cleanupAfter } }, { new: true }).exec();
  }
  retireCurrent(input: { sessionId: Types.ObjectId; status: "CANCELLED" | "INVALIDATED"; cleanupAfter: Date; invalidationCode?: string }) {
    const terminalFields = input.status === "CANCELLED"
      ? { cancelledAt: new Date() }
      : { invalidatedAt: new Date(), invalidationCode: input.invalidationCode ?? "SESSION_REPLACED" };
    return FaceVerificationSession.findOneAndUpdate(
      { _id: input.sessionId, isCurrent: true },
      { $set: { status: input.status, isCurrent: false, cleanupAfter: input.cleanupAfter, ...terminalFields } },
      { new: true },
    ).exec();
  }
  invalidateCompletedForAvatar(profileId: Types.ObjectId, avatarFingerprint: string, cleanupAfter: Date) {
    return FaceVerificationSession.findOneAndUpdate({ profileId, isCurrent: true, status: "CAPTURE_COMPLETE", avatarFingerprint: { $ne: avatarFingerprint } }, { $set: { status: "INVALIDATED", isCurrent: false, invalidatedAt: new Date(), invalidationCode: "AVATAR_CHANGED", cleanupAfter } }, { new: true }).exec();
  }
  invalidateForRequestRetentionExpiry(input: { requestId: Types.ObjectId; now: Date; cleanupAfter: Date }) {
    return FaceVerificationSession.findOneAndUpdate(
      { verificationRequestId: input.requestId, isCurrent: true },
      { $set: { status: "INVALIDATED", isCurrent: false, invalidatedAt: input.now, invalidationCode: "REQUEST_RETENTION_EXPIRED", cleanupAfter: input.cleanupAfter } },
      { new: true },
    ).exec();
  }
  bindCompletedToRequest(input: { profileId: Types.ObjectId; requestId: Types.ObjectId; version: number; avatarFingerprint: string }) {
    return FaceVerificationSession.findOneAndUpdate({ profileId: input.profileId, isCurrent: true, status: "CAPTURE_COMPLETE", profileSubmissionVersion: input.version, avatarFingerprint: input.avatarFingerprint, verificationRequestId: { $exists: false } }, { $set: { verificationRequestId: input.requestId } }, { new: true }).exec();
  }
  findCurrentCompletedForInitialSubmission(input: { profileId: Types.ObjectId; userId: Types.ObjectId; version: number; avatarFingerprint: string }) {
    return FaceVerificationSession.findOne({ profileId: input.profileId, userId: input.userId, isCurrent: true, status: "CAPTURE_COMPLETE", profileSubmissionVersion: input.version, avatarFingerprint: input.avatarFingerprint }).exec();
  }
}
export const faceVerificationSessionRepository = new FaceVerificationSessionRepository();
