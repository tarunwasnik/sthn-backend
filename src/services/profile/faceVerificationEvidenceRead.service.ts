import { Types } from "mongoose";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES, FACE_VERIFICATION_EVIDENCE_MAX_BYTES, FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS, FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "./faceVerification.constants";
import { FaceVerificationEvidenceStorageReader, readFaceVerificationEvidenceAsset } from "./faceVerificationEvidenceStorage.service";
import { assertFaceVerificationImageBuffer, mimeTypeForFaceVerificationFormat, normalizeFaceVerificationFormat, normalizeFaceVerificationMimeType } from "./faceVerificationEvidenceValidation.service";
import { FaceVerificationEvidenceBytesDescriptor } from "./faceVerificationEvidenceRead.types";

const expectedIndexes = [0, 1, 2, 3, 4];

export const resolveProfileVerificationEvidenceAuthority = async (input: { verificationRequestId: string; now?: Date }) => {
  if (!Types.ObjectId.isValid(input.verificationRequestId)) throw new ProfileVerificationInferenceError("Invalid verification request identity", "INVALID_INPUT", 400);
  const request = await profileVerificationRequestRepository.findById(new Types.ObjectId(input.verificationRequestId));
  if (!request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED"
    || request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS <= (input.now ?? new Date()).getTime()) {
    return { request: null, session: null, records: null, noOp: "TERMINAL_REQUEST" as const };
  }
  const session = await faceVerificationSessionRepository.findCurrentCompletedBoundToRequest({ requestId: request._id, profileId: request.profileId, userId: request.userId });
  if (!session) throw new ProfileVerificationInferenceError("A completed bound face verification session is required", "SESSION_NOT_COMPLETE", 409);
  if (session.profileSubmissionVersion !== request.profileSubmissionVersion) return { request: null, session: null, records: null, noOp: "STALE_SUBMISSION" as const };
  const records = await faceVerificationEvidenceRepository.listStoredForSession(session._id);
  if (records.length !== 5 || records.some((record, index) => (
    record.challengeIndex !== expectedIndexes[index] || record.challenge !== session.challenges[index]
    || String(record.userId) !== String(request.userId) || String(record.profileId) !== String(request.profileId)
    || String(record.verificationRequestId) !== String(request._id) || record.cloudinaryResourceType !== "image"
    || !record.bytes || !normalizeFaceVerificationMimeType(record.mimeType) || !normalizeFaceVerificationFormat(record.format)
  ))) throw new ProfileVerificationInferenceError("Face evidence is incomplete or inconsistent", "EVIDENCE_INCOMPLETE", 409);
  if (records.some((record) => (record.bytes ?? 0) > FACE_VERIFICATION_EVIDENCE_MAX_BYTES)) throw new ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
  const declaredAggregate = records.reduce((total, record) => total + (record.bytes ?? 0), 0);
  if (declaredAggregate > FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES) throw new ProfileVerificationInferenceError("Face evidence exceeds the permitted aggregate size", "EVIDENCE_TOO_LARGE", 409);
  return { request, session, records, noOp: null };
};

const sanitizedReadError = (error: unknown) => {
  if (!(error instanceof ProfileVerificationInferenceError)) {
    return new ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  }
  const messages: Record<ProfileVerificationInferenceError["code"], string> = {
    INVALID_INPUT: "Invalid verification request identity", STALE_SUBMISSION: "Face evidence submission is stale", TERMINAL_REQUEST: "Face evidence is no longer actionable", BIOMETRIC_RETENTION_EXPIRED: "Face evidence is no longer actionable",
    SESSION_NOT_COMPLETE: "A completed bound face verification session is required", EVIDENCE_INCOMPLETE: "Face evidence is incomplete or inconsistent",
    EVIDENCE_NOT_AVAILABLE: "Face evidence is not available", EVIDENCE_INTEGRITY_FAILED: "Face evidence integrity validation failed",
    EVIDENCE_TOO_LARGE: "Face evidence exceeds the permitted size", EVIDENCE_UNSUPPORTED_TYPE: "Face evidence type is not supported",
    EVIDENCE_RETRIEVAL_TIMEOUT: "Face evidence retrieval timed out", EVIDENCE_RETRIEVAL_FAILED: "Face evidence retrieval failed",
    PIPELINE_IDENTITY_INVALID: "Inference pipeline identity is invalid", FINDINGS_INVALID: "Inference findings are invalid", TECHNICAL_FAILURE: "Face evidence retrieval failed",
  };
  return new ProfileVerificationInferenceError(messages[error.code], error.code, error.statusCode, error.retryable);
};

export const readProfileVerificationEvidenceBytes = async (input: {
  verificationRequestId: string;
  storageReader?: FaceVerificationEvidenceStorageReader;
}): Promise<{ evidence: FaceVerificationEvidenceBytesDescriptor[] | null; noOp: "TERMINAL_REQUEST" | "STALE_SUBMISSION" | null }> => {
  const authority = await resolveProfileVerificationEvidenceAuthority(input);
  if (authority.noOp || !authority.request || !authority.session || !authority.records) return { evidence: null, noOp: authority.noOp };
  const { request, session, records } = authority;

  const storageReader = input.storageReader ?? readFaceVerificationEvidenceAsset;
  const descriptors: FaceVerificationEvidenceBytesDescriptor[] = [];
  let aggregateBytes = 0;
  try {
    for (const record of records) {
      const remainingBytes = Math.min(FACE_VERIFICATION_EVIDENCE_MAX_BYTES, FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES - aggregateBytes);
      const asset = await storageReader({ publicId: record.cloudinaryPublicId, format: record.format!, maximumBytes: remainingBytes, timeoutMs: FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS });
      let format;
      try { format = assertFaceVerificationImageBuffer(asset.bytes); }
      catch { throw new ProfileVerificationInferenceError("Face evidence integrity validation failed", "EVIDENCE_INTEGRITY_FAILED", 409); }
      const persistedMimeType = normalizeFaceVerificationMimeType(record.mimeType);
      const persistedFormat = normalizeFaceVerificationFormat(record.format);
      const responseMimeType = normalizeFaceVerificationMimeType(asset.contentType);
      if (!persistedMimeType || !persistedFormat || !responseMimeType
        || format !== persistedFormat || responseMimeType !== persistedMimeType
        || mimeTypeForFaceVerificationFormat(format) !== persistedMimeType
        || asset.byteLength !== asset.bytes.length || asset.byteLength !== record.bytes) {
        throw new ProfileVerificationInferenceError("Face evidence integrity validation failed", "EVIDENCE_INTEGRITY_FAILED", 409);
      }
      aggregateBytes += asset.byteLength;
      if (aggregateBytes > FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES) throw new ProfileVerificationInferenceError("Face evidence exceeds the permitted aggregate size", "EVIDENCE_TOO_LARGE", 409);
      descriptors.push({ challengeIndex: record.challengeIndex, challenge: record.challenge, mimeType: persistedMimeType, format, byteLength: asset.byteLength, bytes: asset.bytes });
    }
    return { evidence: descriptors, noOp: null };
  } catch (error) {
    descriptors.length = 0;
    throw sanitizedReadError(error);
  }
};
