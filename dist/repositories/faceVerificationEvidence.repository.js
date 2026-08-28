"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faceVerificationEvidenceRepository = exports.FaceVerificationEvidenceRepository = void 0;
const faceVerificationEvidence_model_1 = require("../models/faceVerificationEvidence.model");
const faceVerification_constants_1 = require("../services/profile/faceVerification.constants");
class FaceVerificationEvidenceRepository {
    findSlot(sessionId, challengeIndex) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId, challengeIndex }).exec(); }
    createReservation(input) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.create({ ...input, status: "UPLOADING", cloudinaryResourceType: "image", cleanupAfter: new Date(Date.now() + faceVerification_constants_1.FACE_VERIFICATION_SHORT_CLEANUP_MS) }); }
    finalizeStored(id, input) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "UPLOADING" }, { $set: { status: "STORED", ...input }, $unset: { cleanupAfter: 1 } }, { new: true }).exec(); }
    setCleanupForSession(sessionId, cleanupAfter) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.updateMany({ sessionId, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] } }, [{ $set: { cleanupAfter: { $min: [{ $ifNull: ["$cleanupAfter", cleanupAfter] }, cleanupAfter] }, status: { $cond: [{ $lte: [cleanupAfter, new Date()] }, "DELETE_PENDING", "$status"] } } }]).exec(); }
    bindSessionEvidence(sessionId, requestId) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.updateMany({ sessionId, verificationRequestId: { $exists: false } }, { $set: { verificationRequestId: requestId } }).exec(); }
    setRetentionForRequest(requestId, cleanupAfter) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.updateMany({ verificationRequestId: requestId, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] } }, [{ $set: { cleanupAfter: { $min: [{ $ifNull: ["$cleanupAfter", cleanupAfter] }, cleanupAfter] }, status: { $cond: [{ $and: [{ $eq: ["$status", "DELETE_PENDING"] }, { $gt: ["$cleanupAfter", new Date()] }] }, "STORED", "$status"] } } }]).exec(); }
    countStored(sessionId) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId, status: "STORED" }).exec(); }
    listStoredForSession(sessionId) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.find({ sessionId, status: "STORED" }).sort({ challengeIndex: 1, _id: 1 }).exec(); }
    listDueForCleanup(now, limit = 50) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.find({ status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] }, cleanupAfter: { $lte: now } }).sort({ cleanupAfter: 1 }).limit(limit).exec(); }
    claimDueForDeletion(id, now) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] }, cleanupAfter: { $lte: now }, deletedAt: { $exists: false } }, { $set: { status: "DELETE_PENDING" } }, { new: true }).exec(); }
    markDeleted(id, now) { return faceVerificationEvidence_model_1.FaceVerificationEvidence.findOneAndUpdate({ _id: id, status: "DELETE_PENDING", deletedAt: { $exists: false } }, { $set: { status: "DELETED", deletedAt: now } }, { new: true }).exec(); }
}
exports.FaceVerificationEvidenceRepository = FaceVerificationEvidenceRepository;
exports.faceVerificationEvidenceRepository = new FaceVerificationEvidenceRepository();
