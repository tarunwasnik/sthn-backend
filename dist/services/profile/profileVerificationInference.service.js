"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeProfileVerificationInference = exports.deriveFaceEvidenceSetFingerprint = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = require("mongoose");
const ulid_1 = require("ulid");
const profileVerificationInference_enums_1 = require("../../enums/profileVerificationInference.enums");
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const profileVerificationInferenceResult_repository_1 = require("../../repositories/profileVerificationInferenceResult.repository");
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const faceVerificationSession_repository_1 = require("../../repositories/faceVerificationSession.repository");
const profileVerificationRequest_repository_1 = require("../../repositories/profileVerificationRequest.repository");
const faceVerification_constants_1 = require("./faceVerification.constants");
const sha256 = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const asCanonicalJson = (value) => JSON.stringify(value);
const isDuplicateKey = (error) => typeof error === "object" && error !== null && "code" in error && error.code === 11000;
const isNonEmptyString = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
const isArtifactSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const includes = (values, value) => typeof value === "string" && values.includes(value);
const validateComponent = (component) => (typeof component === "object" && component !== null
    && isNonEmptyString(component.identifier, 120)
    && isNonEmptyString(component.version, 120)
    && isArtifactSha256(component.artifactSha256));
const normalizePipelineManifest = (manifest) => {
    if (!manifest || !includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS, manifest.kind)
        || !isNonEmptyString(manifest.pipelineVersion, 120)
        || !isNonEmptyString(manifest.runtimeIdentifier, 120)
        || !isNonEmptyString(manifest.runtimeVersion, 120)
        || (manifest.preprocessingVersion !== undefined && !isNonEmptyString(manifest.preprocessingVersion, 120))
        || (manifest.detector !== undefined && !validateComponent(manifest.detector))
        || (manifest.embedding !== undefined && !validateComponent(manifest.embedding))) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Invalid inference pipeline identity", "PIPELINE_IDENTITY_INVALID", 400);
    }
    if (manifest.kind === "MODEL_RUNTIME" && (!manifest.detector || !manifest.embedding || !manifest.preprocessingVersion)) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Model runtime pipeline identity is incomplete", "PIPELINE_IDENTITY_INVALID", 400);
    }
    if (manifest.kind === "MODEL_RUNTIME_DETECTOR_ONLY" && (!manifest.detector || !manifest.preprocessingVersion || manifest.embedding)) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Detector-only pipeline identity is incomplete", "PIPELINE_IDENTITY_INVALID", 400);
    }
    return {
        kind: manifest.kind,
        pipelineVersion: manifest.pipelineVersion.trim(),
        runtimeIdentifier: manifest.runtimeIdentifier.trim(),
        runtimeVersion: manifest.runtimeVersion.trim(),
        ...(manifest.preprocessingVersion ? { preprocessingVersion: manifest.preprocessingVersion.trim() } : {}),
        ...(manifest.detector ? { detector: { identifier: manifest.detector.identifier.trim(), version: manifest.detector.version.trim(), artifactSha256: manifest.detector.artifactSha256 } } : {}),
        ...(manifest.embedding ? { embedding: { identifier: manifest.embedding.identifier.trim(), version: manifest.embedding.version.trim(), artifactSha256: manifest.embedding.artifactSha256 } } : {}),
    };
};
const validateFindings = (findings, descriptor) => {
    if (!findings || !Array.isArray(findings.captures) || findings.captures.length !== 5
        || !findings.crossCapture || !findings.avatar || !findings.antiSpoof) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Inference findings are incomplete", "FINDINGS_INVALID", 400);
    }
    const captures = [...findings.captures].sort((left, right) => left.challengeIndex - right.challengeIndex);
    for (let index = 0; index < captures.length; index += 1) {
        const finding = captures[index];
        const source = descriptor.captures[index];
        if (!source || finding.challengeIndex !== source.challengeIndex || finding.challenge !== source.challenge
            || !includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_FACE_COUNT_FINDINGS, finding.faceCount)
            || !includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS, finding.usability)
            || !Array.isArray(finding.reasonCodes) || finding.reasonCodes.length > 5
            || new Set(finding.reasonCodes).size !== finding.reasonCodes.length
            || !finding.reasonCodes.every((code) => includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_CAPTURE_REASON_CODES, code))) {
            throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Inference findings are invalid", "FINDINGS_INVALID", 400);
        }
    }
    if (!includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS, findings.crossCapture.status)
        || !Number.isInteger(findings.crossCapture.usableCaptureCount) || findings.crossCapture.usableCaptureCount < 0 || findings.crossCapture.usableCaptureCount > 5
        || !Number.isInteger(findings.crossCapture.outlierCaptureCount) || findings.crossCapture.outlierCaptureCount < 0 || findings.crossCapture.outlierCaptureCount > 5
        || !includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_AVATAR_FINDINGS, findings.avatar.status)
        || !includes(profileVerificationInference_enums_1.PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS, findings.antiSpoof.status)) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Inference findings are invalid", "FINDINGS_INVALID", 400);
    }
    return {
        captures: captures.map((finding) => ({
            challengeIndex: finding.challengeIndex,
            challenge: finding.challenge,
            faceCount: finding.faceCount,
            usability: finding.usability,
            reasonCodes: [...finding.reasonCodes],
        })),
        crossCapture: {
            status: findings.crossCapture.status,
            usableCaptureCount: findings.crossCapture.usableCaptureCount,
            outlierCaptureCount: findings.crossCapture.outlierCaptureCount,
        },
        avatar: { status: findings.avatar.status },
        antiSpoof: { status: findings.antiSpoof.status },
    };
};
const inferenceReference = () => `PROFILE_INFERENCE_${(0, ulid_1.ulid)()}`;
const freezeDescriptor = (descriptor) => Object.freeze({
    ...descriptor,
    pipelineManifest: Object.freeze({
        ...descriptor.pipelineManifest,
        ...(descriptor.pipelineManifest.detector ? { detector: Object.freeze({ ...descriptor.pipelineManifest.detector }) } : {}),
        ...(descriptor.pipelineManifest.embedding ? { embedding: Object.freeze({ ...descriptor.pipelineManifest.embedding }) } : {}),
    }),
    captures: Object.freeze(descriptor.captures.map((capture) => Object.freeze({ ...capture }))),
});
const deriveFaceEvidenceSetFingerprint = (input) => sha256(asCanonicalJson({
    verificationRequestId: String(input.verificationRequestId),
    sessionId: String(input.sessionId),
    profileSubmissionVersion: input.profileSubmissionVersion,
    captures: [...input.captures].sort((left, right) => left.challengeIndex - right.challengeIndex).map((capture) => ({
        challengeIndex: capture.challengeIndex,
        challenge: capture.challenge,
        evidenceIdentity: capture.evidenceIdentity,
    })),
}));
exports.deriveFaceEvidenceSetFingerprint = deriveFaceEvidenceSetFingerprint;
const finalizeProfileVerificationInference = async (input) => {
    if (!mongoose_1.Types.ObjectId.isValid(input.verificationRequestId)) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Invalid verification request identity", "INVALID_INPUT", 400);
    }
    const repository = input.repository ?? profileVerificationInferenceResult_repository_1.profileVerificationInferenceResultRepository;
    const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(new mongoose_1.Types.ObjectId(input.verificationRequestId));
    if (!request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED" || request.status === "EXPIRED") {
        return { result: null, replayed: false, noOp: "TERMINAL_REQUEST" };
    }
    const retentionDeadline = new Date(request.submittedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
    if (retentionDeadline.getTime() <= Date.now()) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Verification biometric retention expired", "BIOMETRIC_RETENTION_EXPIRED", 409);
    }
    const session = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findCurrentCompletedBoundToRequest({
        requestId: request._id,
        profileId: request.profileId,
        userId: request.userId,
    });
    if (!session) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("A completed bound face verification session is required", "SESSION_NOT_COMPLETE", 409);
    }
    if (session.profileSubmissionVersion !== request.profileSubmissionVersion || String(session.verificationRequestId) !== String(request._id)) {
        return { result: null, replayed: false, noOp: "STALE_SUBMISSION" };
    }
    const evidence = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.listStoredForSession(session._id);
    const captures = evidence.map((item) => ({ challengeIndex: item.challengeIndex, challenge: item.challenge, evidenceReference: item.evidenceReference, evidenceIdentity: String(item._id) }));
    const expectedIndexes = [0, 1, 2, 3, 4];
    if (evidence.length !== 5 || captures.some((capture, index) => capture.challengeIndex !== expectedIndexes[index]
        || capture.challenge !== session.challenges[index]
        || String(evidence[index].userId) !== String(request.userId)
        || String(evidence[index].profileId) !== String(request.profileId)
        || String(evidence[index].verificationRequestId) !== String(request._id))) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence is incomplete or inconsistent", "EVIDENCE_INCOMPLETE", 409);
    }
    const manifest = normalizePipelineManifest(input.adapter.pipelineManifest);
    const evidenceSetFingerprint = (0, exports.deriveFaceEvidenceSetFingerprint)({
        verificationRequestId: request._id,
        sessionId: session._id,
        profileSubmissionVersion: request.profileSubmissionVersion,
        captures: captures.map(({ challengeIndex, challenge, evidenceIdentity }) => ({ challengeIndex, challenge, evidenceIdentity })),
    });
    const pipelineManifestFingerprint = sha256(asCanonicalJson(manifest));
    const inferenceRunFingerprint = sha256(asCanonicalJson({
        verificationRequestId: String(request._id),
        profileSubmissionVersion: request.profileSubmissionVersion,
        faceVerificationSessionId: String(session._id),
        evidenceSetFingerprint,
        pipelineManifestFingerprint,
    }));
    const existing = await repository.findByRunFingerprint(inferenceRunFingerprint);
    if (existing)
        return { result: existing, replayed: true, noOp: null };
    const descriptor = {
        verificationRequestId: String(request._id), profileId: String(request.profileId), userId: String(request.userId),
        profileSubmissionVersion: request.profileSubmissionVersion, faceVerificationSessionId: String(session._id), evidenceSetFingerprint,
        pipelineManifest: manifest, captures: captures.map(({ challengeIndex, challenge, evidenceReference }) => ({ challengeIndex, challenge, evidenceReference })),
    };
    const findings = validateFindings(await input.adapter.infer(freezeDescriptor(descriptor)), descriptor);
    const current = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findById(request._id);
    if (!current || !current.isActive || current.status === "EXPIRED" || current.profileSubmissionVersion !== request.profileSubmissionVersion
        || new Date(current.submittedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS).getTime() <= Date.now()) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Verification biometric retention expired", "BIOMETRIC_RETENTION_EXPIRED", 409);
    }
    try {
        const result = await repository.create({
            inferenceReference: inferenceReference(), inferenceRunFingerprint, verificationRequestId: request._id,
            profileId: request.profileId, userId: request.userId, profileSubmissionVersion: request.profileSubmissionVersion,
            faceVerificationSessionId: session._id, evidenceSetFingerprint, pipelineManifestFingerprint,
            pipeline: manifest, findings, retentionDeadline,
        });
        return { result, replayed: false, noOp: null };
    }
    catch (error) {
        if (!isDuplicateKey(error))
            throw error;
        const concurrent = await repository.findByRunFingerprint(inferenceRunFingerprint);
        if (!concurrent)
            throw error;
        return { result: concurrent, replayed: true, noOp: null };
    }
};
exports.finalizeProfileVerificationInference = finalizeProfileVerificationInference;
