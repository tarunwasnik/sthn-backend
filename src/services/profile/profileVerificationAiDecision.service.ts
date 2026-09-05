import { ProfileVerificationInferenceResultDocument } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationDecisionReasonCode, ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { Y4E_FACE_MEMBERSHIP_THRESHOLD, Y4E_MULTI_FACE_MIN_MARGIN } from "../../evaluation/y4ProfileMediaPolicy.service";
import { SFACE_ARTIFACT } from "./profileVerificationFaceEmbeddingAdapter";
import { LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN } from "./profileVerificationGate1LiveAnchorPolicy.service";
import { SFACE_SHADOW_MINIMUM_USABLE_CAPTURES } from "./profileVerificationSFaceShadowAnalysis.service";
import { decideProfileVerificationRequest, escalateProfileVerificationRequest } from "./profileVerificationRequest.service";
import { hasGatedAutomatedDecisionAuthority, isGatedProfileVerificationPolicy, resolveProfileVerificationPolicy } from "./profileVerificationPolicy.service";

type GatedAutomatedDecision =
  | { type: "APPROVE"; similarity: number; threshold: number }
  | { type: "REJECT"; reasonCode: ProfileVerificationDecisionReasonCode; reason: string }
  | { type: "ADMIN_REVIEW"; reason: string };

const correctiveReasons: Record<ProfileVerificationDecisionReasonCode, string> = {
  LIVE_CAPTURE_TECHNICAL_FAILURE: "Please complete a fresh face-verification capture session.",
  LIVE_ANCHOR_INCOHERENT: "The captures could not establish one consistent live person. Please try again.",
  MANDATORY_AVATAR_INVALID: "Choose a clear avatar showing one usable face, then try again.",
  IDENTITY_MISMATCH: "The avatar did not match the completed live captures. Update it and try again.",
};

/** Pure V2 authority mapping. Missing, contradictory, or malformed runtime evidence stays with Admin. */
export const mapGatedV2AutomatedDecision = (
  result: Pick<ProfileVerificationInferenceResultDocument, "gatedPolicyAnalysis" | "profileMediaShadowAnalysis">,
): GatedAutomatedDecision => {
  const analysis = result.gatedPolicyAnalysis;
  if (!analysis || analysis.policy.key !== "GATED_MULTI_MEDIA" || analysis.policy.version !== "V2"
    || analysis.gate1.threshold !== LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN || analysis.gate1.policyVersion !== "V1") {
    return { type: "ADMIN_REVIEW", reason: "Gated verification authority was incomplete or inconsistent." };
  }
  if (analysis.gate1.outcome === "LIVE_CAPTURE_TECHNICAL_FAILURE") return Number.isInteger(analysis.gate1.usableCaptureCount) && analysis.gate1.usableCaptureCount >= 0 && analysis.gate1.usableCaptureCount < 5
    ? { type: "REJECT", reasonCode: "LIVE_CAPTURE_TECHNICAL_FAILURE", reason: correctiveReasons.LIVE_CAPTURE_TECHNICAL_FAILURE }
    : { type: "ADMIN_REVIEW", reason: "Gate 1 technical-failure evidence was inconsistent." };
  if (analysis.gate1.outcome === "LIVE_ANCHOR_INCOHERENT") return analysis.gate1.usableCaptureCount === 5 && Number.isFinite(analysis.gate1.weakestPeerMedian) && analysis.gate1.weakestPeerMedian! < LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN
    ? { type: "REJECT", reasonCode: "LIVE_ANCHOR_INCOHERENT", reason: correctiveReasons.LIVE_ANCHOR_INCOHERENT }
    : { type: "ADMIN_REVIEW", reason: "Gate 1 coherence evidence was inconsistent." };
  if (analysis.gate1.outcome !== "PASS") return { type: "ADMIN_REVIEW", reason: "Gate 1 returned an unsupported result." };
  if (analysis.gate1.usableCaptureCount !== 5 || !Number.isFinite(analysis.gate1.weakestPeerMedian) || analysis.gate1.weakestPeerMedian! < LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN) return { type: "ADMIN_REVIEW", reason: "Gate 1 pass evidence was inconsistent." };
  if (!analysis.gate2 || analysis.gate2.outcome === "MEDIA_SNAPSHOT_UNAVAILABLE" || analysis.gate2.outcome === "LIVE_EVIDENCE_UNAVAILABLE") return { type: "ADMIN_REVIEW", reason: "Required verification evidence was unavailable." };
  if (analysis.gate2.outcome === "AVATAR_INVALID") {
    if (!analysis.gate2.avatarAdmission || analysis.gate2.avatarAdmission === "AVATAR_MEDIA_READ_FAILED") return { type: "ADMIN_REVIEW", reason: "The mandatory avatar could not be read by the verification runtime." };
    if (!["AVATAR_INVALID_NO_FACE", "AVATAR_INVALID_FACE_UNUSABLE", "AVATAR_INVALID_MULTIPLE_FACES"].includes(analysis.gate2.avatarAdmission)) return { type: "ADMIN_REVIEW", reason: "Mandatory-avatar evidence was inconsistent." };
    return { type: "REJECT", reasonCode: "MANDATORY_AVATAR_INVALID", reason: correctiveReasons.MANDATORY_AVATAR_INVALID };
  }
  if (analysis.gate2.outcome !== "READY_FOR_GATE3" || analysis.gate2.avatarAdmission !== "VALID_SINGLE_FACE") return { type: "ADMIN_REVIEW", reason: "Gate 2 readiness evidence was inconsistent." };
  const gate3 = analysis.gate3;
  const exactSFace = result.profileMediaShadowAnalysis?.model.identifier === SFACE_ARTIFACT.identifier
    && result.profileMediaShadowAnalysis.model.version === SFACE_ARTIFACT.version;
  if (!gate3 || !exactSFace || gate3.membershipThreshold !== Y4E_FACE_MEMBERSHIP_THRESHOLD || gate3.multiFaceMinMargin !== Y4E_MULTI_FACE_MIN_MARGIN) return { type: "ADMIN_REVIEW", reason: "Gate 3 model authority was incomplete or inconsistent." };
  if (gate3.conclusion === "UNABLE_TO_DETERMINE" || gate3.reasonCode === "CONTRADICTORY_IDENTITY_EVIDENCE") return { type: "ADMIN_REVIEW", reason: "Identity evidence requires manual review." };
  if (gate3.conclusion === "LIKELY_MISMATCH") {
    if (!Number.isFinite(gate3.avatarMedianSimilarity) || gate3.avatarMembership !== "PERSON_A_NOT_ESTABLISHED" || gate3.avatarMedianSimilarity! >= Y4E_FACE_MEMBERSHIP_THRESHOLD) return { type: "ADMIN_REVIEW", reason: "Gate 3 mismatch evidence was inconsistent." };
    return { type: "REJECT", reasonCode: "IDENTITY_MISMATCH", reason: correctiveReasons.IDENTITY_MISMATCH };
  }
  if (gate3.conclusion === "LIKELY_MATCH" && Number.isFinite(gate3.avatarMedianSimilarity)
    && gate3.avatarMembership === "PERSON_A_SUPPORTED" && gate3.avatarMedianSimilarity! >= Y4E_FACE_MEMBERSHIP_THRESHOLD) return { type: "APPROVE", similarity: gate3.avatarMedianSimilarity!, threshold: Y4E_FACE_MEMBERSHIP_THRESHOLD };
  return { type: "ADMIN_REVIEW", reason: "Gate 3 returned an unsupported or inconsistent result." };
};

const exactInferenceAuthority = (request: ProfileVerificationRequestDocument, result: ProfileVerificationInferenceResultDocument | null) => Boolean(
  result && String(result.verificationRequestId) === String(request._id) && String(result.profileId) === String(request.profileId)
  && String(result.userId) === String(request.userId) && result.profileSubmissionVersion === request.profileSubmissionVersion,
);

/** Applies the immutable policy captured by this request through the canonical lifecycle. */
export const applyProfileVerificationAiDecision = async (input: { request: ProfileVerificationRequestDocument; result: ProfileVerificationInferenceResultDocument | null }) => {
  const policy = resolveProfileVerificationPolicy(input.request);
  const escalateCurrent = (reasonCode: "FACE_MATCH_UNCERTAIN" | "MODEL_FAILURE", reason: string) => escalateProfileVerificationRequest({ profileId: String(input.request.profileId), reasonCode, reason, expectedRequestId: String(input.request._id), expectedSubmissionVersion: input.request.profileSubmissionVersion });
  if (!exactInferenceAuthority(input.request, input.result)) return escalateCurrent("MODEL_FAILURE", "Verification inference authority did not match the active submission.");
  if (isGatedProfileVerificationPolicy(policy)) {
    if (!hasGatedAutomatedDecisionAuthority(policy)) return escalateCurrent("FACE_MATCH_UNCERTAIN", "Gated multi-media V1 evaluation requires manual review.");
    const mapped = mapGatedV2AutomatedDecision(input.result!);
    if (mapped.type === "ADMIN_REVIEW") return escalateCurrent("FACE_MATCH_UNCERTAIN", mapped.reason);
    if (mapped.type === "REJECT") return decideProfileVerificationRequest({ profileId: String(input.request.profileId), decision: "REJECT", authority: "AI", reasonCode: mapped.reasonCode, reason: mapped.reason, expectedRequestId: String(input.request._id), expectedSubmissionVersion: input.request.profileSubmissionVersion });
    return decideProfileVerificationRequest({ profileId: String(input.request.profileId), decision: "APPROVE", authority: "AI", expectedRequestId: String(input.request._id), expectedSubmissionVersion: input.request.profileSubmissionVersion, aiDecisionSnapshot: { source: "AI", model: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version }, similarity: mapped.similarity, threshold: mapped.threshold, decidedAt: new Date() } });
  }
  const analysis = input.result!.shadowIdentityAnalysis;
  const usableCaptureCount = input.result!.findings.crossCapture?.usableCaptureCount ?? 0;
  const valid = Boolean(analysis?.status === "COMPLETED" && analysis.conclusion === "LIKELY_MATCH" && Number.isFinite(analysis.similarity) && Number.isFinite(analysis.threshold) && analysis.model?.identifier === SFACE_ARTIFACT.identifier && analysis.model?.version === SFACE_ARTIFACT.version && usableCaptureCount >= SFACE_SHADOW_MINIMUM_USABLE_CAPTURES);
  if (!valid) return escalateCurrent("FACE_MATCH_UNCERTAIN", analysis?.reason ?? "Automated identity approval conditions were not met.");
  return decideProfileVerificationRequest({ profileId: String(input.request.profileId), decision: "APPROVE", authority: "AI", expectedRequestId: String(input.request._id), expectedSubmissionVersion: input.request.profileSubmissionVersion, aiDecisionSnapshot: { source: "AI", model: analysis!.model!, similarity: analysis!.similarity!, threshold: analysis!.threshold!, decidedAt: new Date() } });
};
