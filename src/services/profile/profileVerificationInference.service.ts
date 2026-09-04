import crypto from "node:crypto";
import { Types } from "mongoose";
import { ulid } from "ulid";

import {
  PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS,
  PROFILE_VERIFICATION_AVATAR_FINDINGS,
  PROFILE_VERIFICATION_CAPTURE_REASON_CODES,
  PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS,
  PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS,
  PROFILE_VERIFICATION_FACE_COUNT_FINDINGS,
  PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS,
  PROFILE_VERIFICATION_SHADOW_IDENTITY_CONCLUSIONS,
  PROFILE_VERIFICATION_SHADOW_IDENTITY_STATUSES,
} from "../../enums/profileVerificationInference.enums";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { ProfileVerificationInferenceResultDocument } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationInferenceResultRepository, profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "./faceVerification.constants";
import { ProfileVerificationInferenceAdapter } from "./profileVerificationInferenceAdapter";
import {
  ProfileVerificationInferenceFindings,
  ProfileVerificationInferenceInputDescriptor,
  ProfileVerificationInferencePipelineComponent,
  ProfileVerificationInferencePipelineManifest,
  ProfileVerificationInferenceOutput,
  ProfileVerificationShadowIdentityAnalysis,
  ProfileVerificationGatedPolicyAnalysis,
} from "./profileVerificationInference.types";
import { resolveProfileVerificationPolicy } from "./profileVerificationPolicy.service";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const asCanonicalJson = (value: unknown) => JSON.stringify(value);
const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
const isNonEmptyString = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
const isArtifactSha256 = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const includes = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => typeof value === "string" && values.includes(value);

const validateComponent = (component: unknown): component is ProfileVerificationInferencePipelineComponent => (
  typeof component === "object" && component !== null
  && isNonEmptyString((component as { identifier?: unknown }).identifier, 120)
  && isNonEmptyString((component as { version?: unknown }).version, 120)
  && isArtifactSha256((component as { artifactSha256?: unknown }).artifactSha256)
);

const normalizePipelineManifest = (manifest: ProfileVerificationInferencePipelineManifest): ProfileVerificationInferencePipelineManifest => {
  if (!manifest || !includes(PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS, manifest.kind)
    || !isNonEmptyString(manifest.pipelineVersion, 120)
    || !isNonEmptyString(manifest.runtimeIdentifier, 120)
    || !isNonEmptyString(manifest.runtimeVersion, 120)
    || (manifest.preprocessingVersion !== undefined && !isNonEmptyString(manifest.preprocessingVersion, 120))
    || (manifest.detector !== undefined && !validateComponent(manifest.detector))
    || (manifest.embedding !== undefined && !validateComponent(manifest.embedding))) {
    throw new ProfileVerificationInferenceError("Invalid inference pipeline identity", "PIPELINE_IDENTITY_INVALID", 400);
  }
  if (manifest.kind === "MODEL_RUNTIME" && (!manifest.detector || !manifest.embedding || !manifest.preprocessingVersion)) {
    throw new ProfileVerificationInferenceError("Model runtime pipeline identity is incomplete", "PIPELINE_IDENTITY_INVALID", 400);
  }
  if (manifest.kind === "MODEL_RUNTIME_DETECTOR_ONLY" && (!manifest.detector || !manifest.preprocessingVersion || manifest.embedding)) {
    throw new ProfileVerificationInferenceError("Detector-only pipeline identity is incomplete", "PIPELINE_IDENTITY_INVALID", 400);
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

const validateFindings = (findings: ProfileVerificationInferenceFindings, descriptor: ProfileVerificationInferenceInputDescriptor) => {
  if (!findings || !Array.isArray(findings.captures) || findings.captures.length !== 5
    || !findings.crossCapture || !findings.avatar || !findings.antiSpoof) {
    throw new ProfileVerificationInferenceError("Inference findings are incomplete", "FINDINGS_INVALID", 400);
  }
  const captures = [...findings.captures].sort((left, right) => left.challengeIndex - right.challengeIndex);
  for (let index = 0; index < captures.length; index += 1) {
    const finding = captures[index];
    const source = descriptor.captures[index];
    if (!source || finding.challengeIndex !== source.challengeIndex || finding.challenge !== source.challenge
      || !includes(PROFILE_VERIFICATION_FACE_COUNT_FINDINGS, finding.faceCount)
      || !includes(PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS, finding.usability)
      || !Array.isArray(finding.reasonCodes) || finding.reasonCodes.length > 5
      || new Set(finding.reasonCodes).size !== finding.reasonCodes.length
      || !finding.reasonCodes.every((code: string) => includes(PROFILE_VERIFICATION_CAPTURE_REASON_CODES, code))) {
      throw new ProfileVerificationInferenceError("Inference findings are invalid", "FINDINGS_INVALID", 400);
    }
  }
  if (!includes(PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS, findings.crossCapture.status)
    || !Number.isInteger(findings.crossCapture.usableCaptureCount) || findings.crossCapture.usableCaptureCount < 0 || findings.crossCapture.usableCaptureCount > 5
    || !Number.isInteger(findings.crossCapture.outlierCaptureCount) || findings.crossCapture.outlierCaptureCount < 0 || findings.crossCapture.outlierCaptureCount > 5
    || !includes(PROFILE_VERIFICATION_AVATAR_FINDINGS, findings.avatar.status)
    || !includes(PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS, findings.antiSpoof.status)) {
    throw new ProfileVerificationInferenceError("Inference findings are invalid", "FINDINGS_INVALID", 400);
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

const validateShadowIdentityAnalysis = (analysis: ProfileVerificationShadowIdentityAnalysis | undefined) => {
  if (!analysis) return undefined;
  if (!includes(PROFILE_VERIFICATION_SHADOW_IDENTITY_STATUSES, analysis.status)
    || (analysis.conclusion !== undefined && !includes(PROFILE_VERIFICATION_SHADOW_IDENTITY_CONCLUSIONS, analysis.conclusion))
    || (analysis.similarity !== undefined && (!Number.isFinite(analysis.similarity) || analysis.similarity < -1 || analysis.similarity > 1))
    || (analysis.threshold !== undefined && (!Number.isFinite(analysis.threshold) || analysis.threshold < -1 || analysis.threshold > 1))
    || (analysis.model !== undefined && (!isNonEmptyString(analysis.model.identifier, 120) || !isNonEmptyString(analysis.model.version, 120)))
    || (analysis.processedAt !== undefined && !(analysis.processedAt instanceof Date))
    || (analysis.reasonCode !== undefined && !isNonEmptyString(analysis.reasonCode, 80))
    || (analysis.reason !== undefined && !isNonEmptyString(analysis.reason, 500))) {
    throw new ProfileVerificationInferenceError("Shadow identity analysis is invalid", "FINDINGS_INVALID", 400);
  }
  return {
    status: analysis.status,
    ...(analysis.conclusion ? { conclusion: analysis.conclusion } : {}),
    ...(analysis.similarity !== undefined ? { similarity: analysis.similarity } : {}),
    ...(analysis.threshold !== undefined ? { threshold: analysis.threshold } : {}),
    ...(analysis.model ? { model: { identifier: analysis.model.identifier.trim(), version: analysis.model.version.trim() } } : {}),
    ...(analysis.processedAt ? { processedAt: analysis.processedAt } : {}),
    ...(analysis.reasonCode ? { reasonCode: analysis.reasonCode.trim() } : {}),
    ...(analysis.reason ? { reason: analysis.reason.trim() } : {}),
  };
};

const validScore = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
const validCount = (value: unknown, maximum: number) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const validateProfileMediaShadowAnalysis = (analysis: ProfileVerificationInferenceOutput["profileMediaShadowAnalysis"] | undefined) => {
  if (!analysis) return undefined;
  const summary = analysis.summary; const live = analysis.live;
  const validStats = (value: { comparisonCount: number; minimumSimilarity: number; maximumSimilarity: number; meanSimilarity: number; medianSimilarity: number }) => validCount(value.comparisonCount, 5) && validScore(value.minimumSimilarity) && validScore(value.maximumSimilarity) && validScore(value.meanSimilarity) && validScore(value.medianSimilarity);
  if (analysis.status !== "COMPLETED" || !(analysis.processedAt instanceof Date)
    || !isNonEmptyString(analysis.model?.identifier, 120) || !isNonEmptyString(analysis.model?.version, 120)
    || !summary || ![summary.submittedMediaCount, summary.processedMediaCount, summary.mediaWithNoFaceCount, summary.mediaWithUsableFacesCount, summary.multiFaceMediaCount, summary.failedMediaCount].every((value) => validCount(value, 8))
    || !live || !validCount(live.usableCaptureCount, 5) || !validCount(live.pairwiseComparisonCount, 10)
    || ![live.minimumSimilarity, live.maximumSimilarity, live.meanSimilarity, live.medianSimilarity].every((value) => value === undefined || validScore(value))
    || !Array.isArray(analysis.media) || analysis.media.length > 8
    || !analysis.media.every((media) => ["AVATAR", "COVER", "PROFILE_PHOTO"].includes(media.role)
      && (media.role === "PROFILE_PHOTO" ? validCount(media.profilePhotoIndex, 5) : media.profilePhotoIndex === undefined)
      && ["NO_FACE", "NO_USABLE_FACE", "FACE_CANDIDATES_AVAILABLE", "MEDIA_READ_FAILED"].includes(media.status)
      && validCount(media.detectedFaceCount, 50) && validCount(media.usableFaceCount, 50) && validCount(media.candidateCount, 50)
      && (!media.bestCandidate || validCount(media.bestCandidate.candidateIndex, 49) && validStats(media.bestCandidate)
        && (media.secondBestMedianSimilarity === undefined || validScore(media.secondBestMedianSimilarity))
        && (media.bestVsSecondMargin === undefined || validScore(media.bestVsSecondMargin))))
  ) throw new ProfileVerificationInferenceError("Profile-media shadow analysis is invalid", "FINDINGS_INVALID", 400);
  return analysis;
};

const validateGatedPolicyAnalysis = (analysis: ProfileVerificationGatedPolicyAnalysis | undefined, policy: ProfileVerificationInferenceInputDescriptor["verificationPolicy"]) => {
  if (!analysis) return undefined;
  if (policy.key !== "GATED_MULTI_MEDIA" || policy.version !== "V1"
    || analysis.policy.key !== policy.key || analysis.policy.version !== policy.version
    || !["PASS", "LIVE_CAPTURE_TECHNICAL_FAILURE", "LIVE_ANCHOR_INCOHERENT"].includes(analysis.gate1?.outcome)
    || !validCount(analysis.gate1.usableCaptureCount, 5) || !validScore(analysis.gate1.threshold)
    || analysis.gate1.threshold !== 0.28 || analysis.gate1.policyVersion !== "V1"
    || (analysis.gate1.weakestPeerMedian !== undefined && !validScore(analysis.gate1.weakestPeerMedian))) {
    throw new ProfileVerificationInferenceError("Gated policy analysis is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate1.outcome !== "PASS" && (analysis.gate2 || analysis.gate3)) {
    throw new ProfileVerificationInferenceError("Gated policy prerequisite order is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate1.outcome === "PASS" && !analysis.gate2) {
    throw new ProfileVerificationInferenceError("Gated policy prerequisite order is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate3 && analysis.gate2?.outcome !== "READY_FOR_GATE3") {
    throw new ProfileVerificationInferenceError("Gated policy prerequisite order is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate2?.outcome === "READY_FOR_GATE3" && !analysis.gate3) {
    throw new ProfileVerificationInferenceError("Gated policy prerequisite order is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate2 && (!["READY_FOR_GATE3", "AVATAR_INVALID", "MEDIA_SNAPSHOT_UNAVAILABLE", "LIVE_EVIDENCE_UNAVAILABLE"].includes(analysis.gate2.outcome)
    || !Object.values(analysis.gate2.optionalMediaSummary).every((value) => validCount(value, 7)))) {
    throw new ProfileVerificationInferenceError("Gated policy analysis is invalid", "FINDINGS_INVALID", 400);
  }
  if (analysis.gate3 && (!["LIKELY_MATCH", "LIKELY_MISMATCH", "UNABLE_TO_DETERMINE"].includes(analysis.gate3.conclusion)
    || !["PERSON_A_SUPPORTED", "PERSON_A_NOT_ESTABLISHED", "TECHNICAL_UNAVAILABLE"].includes(analysis.gate3.avatarMembership)
    || analysis.gate3.membershipThreshold !== .36 || analysis.gate3.multiFaceMinMargin !== .04
    || ![analysis.gate3.optionalPersonASupportCount, analysis.gate3.optionalAmbiguousMediaCount, analysis.gate3.optionalTechnicalFailureCount].every((value) => validCount(value, 7))
    || analysis.gate3.avatarMedianSimilarity !== undefined && !validScore(analysis.gate3.avatarMedianSimilarity))) {
    throw new ProfileVerificationInferenceError("Gated policy analysis is invalid", "FINDINGS_INVALID", 400);
  }
  return analysis;
};

const inferenceReference = () => `PROFILE_INFERENCE_${ulid()}`;

const freezeDescriptor = (descriptor: ProfileVerificationInferenceInputDescriptor): Readonly<ProfileVerificationInferenceInputDescriptor> => Object.freeze({
  ...descriptor,
  pipelineManifest: Object.freeze({
    ...descriptor.pipelineManifest,
    ...(descriptor.pipelineManifest.detector ? { detector: Object.freeze({ ...descriptor.pipelineManifest.detector }) } : {}),
    ...(descriptor.pipelineManifest.embedding ? { embedding: Object.freeze({ ...descriptor.pipelineManifest.embedding }) } : {}),
  }),
  captures: Object.freeze(descriptor.captures.map((capture) => Object.freeze({ ...capture }))),
});

export const deriveFaceEvidenceSetFingerprint = (input: {
  verificationRequestId: Types.ObjectId;
  sessionId: Types.ObjectId;
  profileSubmissionVersion: number;
  captures: Array<{ challengeIndex: number; challenge: string; evidenceIdentity: string }>;
}) => sha256(asCanonicalJson({
  verificationRequestId: String(input.verificationRequestId),
  sessionId: String(input.sessionId),
  profileSubmissionVersion: input.profileSubmissionVersion,
  captures: [...input.captures].sort((left, right) => left.challengeIndex - right.challengeIndex).map((capture) => ({
    challengeIndex: capture.challengeIndex,
    challenge: capture.challenge,
    evidenceIdentity: capture.evidenceIdentity,
  })),
}));

export const finalizeProfileVerificationInference = async (input: {
  verificationRequestId: string;
  adapter: ProfileVerificationInferenceAdapter;
  repository?: ProfileVerificationInferenceResultRepository;
}): Promise<{ result: ProfileVerificationInferenceResultDocument | null; replayed: boolean; noOp: "TERMINAL_REQUEST" | "STALE_SUBMISSION" | null }> => {
  if (!Types.ObjectId.isValid(input.verificationRequestId)) {
    throw new ProfileVerificationInferenceError("Invalid verification request identity", "INVALID_INPUT", 400);
  }
  const repository = input.repository ?? profileVerificationInferenceResultRepository;
  const request = await profileVerificationRequestRepository.findById(new Types.ObjectId(input.verificationRequestId));
  if (!request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED" || request.status === "EXPIRED") {
    return { result: null, replayed: false, noOp: "TERMINAL_REQUEST" };
  }
  const retentionDeadline = new Date(request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  if (retentionDeadline.getTime() <= Date.now()) {
    throw new ProfileVerificationInferenceError("Verification biometric retention expired", "BIOMETRIC_RETENTION_EXPIRED", 409);
  }
  const session = await faceVerificationSessionRepository.findCurrentCompletedBoundToRequest({
    requestId: request._id,
    profileId: request.profileId,
    userId: request.userId,
  });
  if (!session) {
    throw new ProfileVerificationInferenceError("A completed bound face verification session is required", "SESSION_NOT_COMPLETE", 409);
  }
  if (session.profileSubmissionVersion !== request.profileSubmissionVersion || String(session.verificationRequestId) !== String(request._id)) {
    return { result: null, replayed: false, noOp: "STALE_SUBMISSION" };
  }
  const evidence = await faceVerificationEvidenceRepository.listStoredForSession(session._id);
  const captures = evidence.map((item) => ({ challengeIndex: item.challengeIndex, challenge: item.challenge, evidenceReference: item.evidenceReference, evidenceIdentity: String(item._id) }));
  const expectedIndexes = [0, 1, 2, 3, 4];
  if (evidence.length !== 5 || captures.some((capture, index) => capture.challengeIndex !== expectedIndexes[index]
    || capture.challenge !== session.challenges[index]
    || String(evidence[index].userId) !== String(request.userId)
    || String(evidence[index].profileId) !== String(request.profileId)
    || String(evidence[index].verificationRequestId) !== String(request._id))) {
    throw new ProfileVerificationInferenceError("Face evidence is incomplete or inconsistent", "EVIDENCE_INCOMPLETE", 409);
  }
  const manifest = normalizePipelineManifest(input.adapter.pipelineManifest);
  const verificationPolicy = resolveProfileVerificationPolicy(request);
  const evidenceSetFingerprint = deriveFaceEvidenceSetFingerprint({
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
    verificationPolicy,
  }));
  const existing = await repository.findByRunFingerprint(inferenceRunFingerprint);
  if (existing) return { result: existing, replayed: true, noOp: null };

  const descriptor: ProfileVerificationInferenceInputDescriptor = {
    verificationRequestId: String(request._id), profileId: String(request.profileId), userId: String(request.userId),
    profileSubmissionVersion: request.profileSubmissionVersion, faceVerificationSessionId: String(session._id), avatarFingerprint: session.avatarFingerprint, evidenceSetFingerprint,
    pipelineManifest: manifest, captures: captures.map(({ challengeIndex, challenge, evidenceReference }) => ({ challengeIndex, challenge, evidenceReference })),
    verificationPolicy,
    ...(request.submittedMedia ? { submittedMedia: request.submittedMedia } : {}),
  };
  const adapterOutput = await input.adapter.infer(freezeDescriptor(descriptor));
  const output = ("findings" in adapterOutput ? adapterOutput : { findings: adapterOutput }) as ProfileVerificationInferenceOutput;
  const findings = validateFindings(output.findings, descriptor);
  const shadowIdentityAnalysis = validateShadowIdentityAnalysis(output.shadowIdentityAnalysis);
  const profileMediaShadowAnalysis = validateProfileMediaShadowAnalysis(output.profileMediaShadowAnalysis);
  const gatedPolicyAnalysis = validateGatedPolicyAnalysis(output.gatedPolicyAnalysis, descriptor.verificationPolicy);
  const current = await profileVerificationRequestRepository.findById(request._id);
  if (!current || !current.isActive || current.status === "EXPIRED" || current.profileSubmissionVersion !== request.profileSubmissionVersion
    || new Date(current.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS).getTime() <= Date.now()) {
    throw new ProfileVerificationInferenceError("Verification biometric retention expired", "BIOMETRIC_RETENTION_EXPIRED", 409);
  }
  try {
    const result = await repository.create({
      inferenceReference: inferenceReference(), inferenceRunFingerprint, verificationRequestId: request._id,
      profileId: request.profileId, userId: request.userId, profileSubmissionVersion: request.profileSubmissionVersion,
      faceVerificationSessionId: session._id, evidenceSetFingerprint, pipelineManifestFingerprint,
      pipeline: manifest, findings, ...(shadowIdentityAnalysis ? { shadowIdentityAnalysis } : {}), ...(profileMediaShadowAnalysis ? { profileMediaShadowAnalysis } : {}), ...(gatedPolicyAnalysis ? { gatedPolicyAnalysis } : {}), retentionDeadline,
    });
    return { result, replayed: false, noOp: null };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const concurrent = await repository.findByRunFingerprint(inferenceRunFingerprint);
    if (!concurrent) throw error;
    return { result: concurrent, replayed: true, noOp: null };
  }
};
