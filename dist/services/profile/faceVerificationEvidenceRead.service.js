"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readProfileVerificationEvidenceBytes = void 0;
const mongoose_1 = require("mongoose");
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const faceVerificationSession_repository_1 = require("../../repositories/faceVerificationSession.repository");
const profileVerificationRequest_repository_1 = require("../../repositories/profileVerificationRequest.repository");
const faceVerification_constants_1 = require("./faceVerification.constants");
const faceVerificationEvidenceStorage_service_1 = require("./faceVerificationEvidenceStorage.service");
const faceVerificationEvidenceValidation_service_1 = require("./faceVerificationEvidenceValidation.service");
const expectedIndexes = [0, 1, 2, 3, 4];
const sanitizedReadError = (error) => {
    if (!(error instanceof ProfileVerificationInferenceError_1.ProfileVerificationInferenceError)) {
        return new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
    }
    const messages = {
        INVALID_INPUT: "Invalid verification request identity", STALE_SUBMISSION: "Face evidence submission is stale", TERMINAL_REQUEST: "Face evidence is no longer actionable",
        SESSION_NOT_COMPLETE: "A completed bound face verification session is required", EVIDENCE_INCOMPLETE: "Face evidence is incomplete or inconsistent",
        EVIDENCE_NOT_AVAILABLE: "Face evidence is not available", EVIDENCE_INTEGRITY_FAILED: "Face evidence integrity validation failed",
        EVIDENCE_TOO_LARGE: "Face evidence exceeds the permitted size", EVIDENCE_UNSUPPORTED_TYPE: "Face evidence type is not supported",
        EVIDENCE_RETRIEVAL_TIMEOUT: "Face evidence retrieval timed out", EVIDENCE_RETRIEVAL_FAILED: "Face evidence retrieval failed",
        PIPELINE_IDENTITY_INVALID: "Inference pipeline identity is invalid", FINDINGS_INVALID: "Inference findings are invalid", TECHNICAL_FAILURE: "Face evidence retrieval failed",
    };
    return new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError(messages[error.code], error.code, error.statusCode, error.retryable);
};
const readProfileVerificationEvidenceBytes = async (input) => {
    if (!mongoose_1.Types.ObjectId.isValid(input.verificationRequestId))
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Invalid verification request identity", "INVALID_INPUT", 400);
    const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(new mongoose_1.Types.ObjectId(input.verificationRequestId));
    if (!request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED") {
        return { evidence: null, noOp: "TERMINAL_REQUEST" };
    }
    const session = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findCurrentCompletedBoundToRequest({ requestId: request._id, profileId: request.profileId, userId: request.userId });
    if (!session)
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("A completed bound face verification session is required", "SESSION_NOT_COMPLETE", 409);
    if (session.profileSubmissionVersion !== request.profileSubmissionVersion)
        return { evidence: null, noOp: "STALE_SUBMISSION" };
    const records = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.listStoredForSession(session._id);
    if (records.length !== 5 || records.some((record, index) => (record.challengeIndex !== expectedIndexes[index]
        || record.challenge !== session.challenges[index]
        || String(record.userId) !== String(request.userId)
        || String(record.profileId) !== String(request.profileId)
        || String(record.verificationRequestId) !== String(request._id)
        || record.cloudinaryResourceType !== "image"
        || !record.bytes
        || !(0, faceVerificationEvidenceValidation_service_1.normalizeFaceVerificationMimeType)(record.mimeType)
        || !(0, faceVerificationEvidenceValidation_service_1.normalizeFaceVerificationFormat)(record.format))))
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence is incomplete or inconsistent", "EVIDENCE_INCOMPLETE", 409);
    if (records.some((record) => (record.bytes ?? 0) > faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_BYTES)) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
    }
    const declaredAggregate = records.reduce((total, record) => total + (record.bytes ?? 0), 0);
    if (declaredAggregate > faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES)
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence exceeds the permitted aggregate size", "EVIDENCE_TOO_LARGE", 409);
    const storageReader = input.storageReader ?? faceVerificationEvidenceStorage_service_1.readFaceVerificationEvidenceAsset;
    const descriptors = [];
    let aggregateBytes = 0;
    try {
        for (const record of records) {
            const remainingBytes = Math.min(faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_BYTES, faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES - aggregateBytes);
            const asset = await storageReader({ publicId: record.cloudinaryPublicId, format: record.format, maximumBytes: remainingBytes, timeoutMs: faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS });
            let format;
            try {
                format = (0, faceVerificationEvidenceValidation_service_1.assertFaceVerificationImageBuffer)(asset.bytes);
            }
            catch {
                throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence integrity validation failed", "EVIDENCE_INTEGRITY_FAILED", 409);
            }
            const persistedMimeType = (0, faceVerificationEvidenceValidation_service_1.normalizeFaceVerificationMimeType)(record.mimeType);
            const persistedFormat = (0, faceVerificationEvidenceValidation_service_1.normalizeFaceVerificationFormat)(record.format);
            const responseMimeType = (0, faceVerificationEvidenceValidation_service_1.normalizeFaceVerificationMimeType)(asset.contentType);
            if (!persistedMimeType || !persistedFormat || !responseMimeType
                || format !== persistedFormat || responseMimeType !== persistedMimeType
                || (0, faceVerificationEvidenceValidation_service_1.mimeTypeForFaceVerificationFormat)(format) !== persistedMimeType
                || asset.byteLength !== asset.bytes.length || asset.byteLength !== record.bytes) {
                throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence integrity validation failed", "EVIDENCE_INTEGRITY_FAILED", 409);
            }
            aggregateBytes += asset.byteLength;
            if (aggregateBytes > faceVerification_constants_1.FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES)
                throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence exceeds the permitted aggregate size", "EVIDENCE_TOO_LARGE", 409);
            descriptors.push({ challengeIndex: record.challengeIndex, challenge: record.challenge, mimeType: persistedMimeType, format, byteLength: asset.byteLength, bytes: asset.bytes });
        }
        return { evidence: descriptors, noOp: null };
    }
    catch (error) {
        descriptors.length = 0;
        throw sanitizedReadError(error);
    }
};
exports.readProfileVerificationEvidenceBytes = readProfileVerificationEvidenceBytes;
