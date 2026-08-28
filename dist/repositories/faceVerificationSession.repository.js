"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faceVerificationSessionRepository = exports.FaceVerificationSessionRepository = void 0;
const faceVerificationSession_model_1 = require("../models/faceVerificationSession.model");
class FaceVerificationSessionRepository {
    findCurrent(profileId) { return faceVerificationSession_model_1.FaceVerificationSession.findOne({ profileId, isCurrent: true }).exec(); }
    findOwned(sessionReference, userId) { return faceVerificationSession_model_1.FaceVerificationSession.findOne({ sessionReference, userId }).exec(); }
    findById(id) { return faceVerificationSession_model_1.FaceVerificationSession.findById(id).exec(); }
    findCurrentCompletedBoundToRequest(input) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOne({
            verificationRequestId: input.requestId,
            profileId: input.profileId,
            userId: input.userId,
            isCurrent: true,
            status: "CAPTURE_COMPLETE",
            requiredCaptureCount: 5,
            acceptedCaptureCount: 5,
        }).exec();
    }
    create(input) {
        return faceVerificationSession_model_1.FaceVerificationSession.create({ ...input, status: "CREATED", isCurrent: true, requiredCaptureCount: 5, acceptedCaptureCount: 0, startedAt: new Date() });
    }
    listExpiredCurrent(now) { return faceVerificationSession_model_1.FaceVerificationSession.find({ isCurrent: true, status: { $in: ["CREATED", "CAPTURING"] }, expiresAt: { $lte: now } }).exec(); }
    expire(sessionId, now, cleanupAfter) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOneAndUpdate({ _id: sessionId, isCurrent: true, status: { $in: ["CREATED", "CAPTURING"] }, expiresAt: { $lte: now } }, { $set: { status: "EXPIRED", isCurrent: false, cleanupAfter } }, { new: true }).exec();
    }
    retireCurrent(input) {
        const terminalFields = input.status === "CANCELLED"
            ? { cancelledAt: new Date() }
            : { invalidatedAt: new Date(), invalidationCode: input.invalidationCode ?? "SESSION_REPLACED" };
        return faceVerificationSession_model_1.FaceVerificationSession.findOneAndUpdate({ _id: input.sessionId, isCurrent: true }, { $set: { status: input.status, isCurrent: false, cleanupAfter: input.cleanupAfter, ...terminalFields } }, { new: true }).exec();
    }
    invalidateCompletedForAvatar(profileId, avatarFingerprint, cleanupAfter) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOneAndUpdate({ profileId, isCurrent: true, status: "CAPTURE_COMPLETE", avatarFingerprint: { $ne: avatarFingerprint } }, { $set: { status: "INVALIDATED", isCurrent: false, invalidatedAt: new Date(), invalidationCode: "AVATAR_CHANGED", cleanupAfter } }, { new: true }).exec();
    }
    invalidateForRequestRetentionExpiry(input) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOneAndUpdate({ verificationRequestId: input.requestId, isCurrent: true }, { $set: { status: "INVALIDATED", isCurrent: false, invalidatedAt: input.now, invalidationCode: "REQUEST_RETENTION_EXPIRED", cleanupAfter: input.cleanupAfter } }, { new: true }).exec();
    }
    bindCompletedToRequest(input) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOneAndUpdate({ profileId: input.profileId, isCurrent: true, status: "CAPTURE_COMPLETE", profileSubmissionVersion: input.version, avatarFingerprint: input.avatarFingerprint, verificationRequestId: { $exists: false } }, { $set: { verificationRequestId: input.requestId } }, { new: true }).exec();
    }
    findCurrentCompletedForInitialSubmission(input) {
        return faceVerificationSession_model_1.FaceVerificationSession.findOne({ profileId: input.profileId, userId: input.userId, isCurrent: true, status: "CAPTURE_COMPLETE", profileSubmissionVersion: input.version, avatarFingerprint: input.avatarFingerprint }).exec();
    }
}
exports.FaceVerificationSessionRepository = FaceVerificationSessionRepository;
exports.faceVerificationSessionRepository = new FaceVerificationSessionRepository();
