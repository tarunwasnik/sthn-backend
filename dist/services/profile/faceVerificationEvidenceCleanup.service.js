"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileFaceVerificationEvidenceRetention = exports.scheduleFaceEvidenceRetentionForDecision = void 0;
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const faceVerificationEvidenceStorage_service_1 = require("./faceVerificationEvidenceStorage.service");
const faceVerificationSession_service_1 = require("./faceVerificationSession.service");
const faceVerification_constants_1 = require("./faceVerification.constants");
const faceVerification_constants_2 = require("./faceVerification.constants");
const profileVerificationRequest_repository_1 = require("../../repositories/profileVerificationRequest.repository");
const profileVerificationInferenceResult_repository_1 = require("../../repositories/profileVerificationInferenceResult.repository");
const profileVerificationRequest_service_1 = require("./profileVerificationRequest.service");
const scheduleFaceEvidenceRetentionForDecision = async (requestId, decision, decidedAt) => {
    const duration = decision === "APPROVE" ? faceVerification_constants_1.FACE_VERIFICATION_APPROVED_RETENTION_MS : faceVerification_constants_1.FACE_VERIFICATION_REJECTED_RETENTION_MS;
    const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(requestId);
    if (!request)
        return null;
    const maximum = new Date(request.submittedAt.getTime() + faceVerification_constants_2.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
    const deadline = new Date(Math.min(maximum.getTime(), decidedAt.getTime() + duration));
    await profileVerificationInferenceResult_repository_1.profileVerificationInferenceResultRepository.shortenRetentionForRequest(requestId, deadline);
    return faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setRetentionForRequest(requestId, deadline);
};
exports.scheduleFaceEvidenceRetentionForDecision = scheduleFaceEvidenceRetentionForDecision;
const reconcileFaceVerificationEvidenceRetention = async (now = new Date()) => {
    await (0, profileVerificationRequest_service_1.expireProfileVerificationRequests)(now);
    await (0, faceVerificationSession_service_1.expireFaceVerificationSessions)(now);
    const results = await profileVerificationInferenceResult_repository_1.profileVerificationInferenceResultRepository.listDueForDeletion(now);
    for (const result of results)
        await profileVerificationInferenceResult_repository_1.profileVerificationInferenceResultRepository.deleteById(result._id);
    const due = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.listDueForCleanup(now);
    let deleted = 0;
    for (const evidence of due) {
        const claimed = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.claimDueForDeletion(evidence._id, now);
        if (!claimed)
            continue;
        const outcome = await (0, faceVerificationEvidenceStorage_service_1.deleteFaceVerificationEvidence)(claimed.cloudinaryPublicId);
        if (outcome === "DELETED" || outcome === "ALREADY_MISSING") {
            await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.markDeleted(claimed._id, now);
            deleted += 1;
        }
    }
    return { scanned: due.length, deleted, resultsDeleted: results.length };
};
exports.reconcileFaceVerificationEvidenceRetention = reconcileFaceVerificationEvidenceRetention;
