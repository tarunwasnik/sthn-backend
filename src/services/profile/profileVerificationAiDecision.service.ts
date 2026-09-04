import { ProfileVerificationInferenceResultDocument } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { SFACE_ARTIFACT } from "./profileVerificationFaceEmbeddingAdapter";
import { SFACE_SHADOW_MINIMUM_USABLE_CAPTURES } from "./profileVerificationSFaceShadowAnalysis.service";
import { decideProfileVerificationRequest, escalateProfileVerificationRequest } from "./profileVerificationRequest.service";
import { isGatedProfileVerificationPolicy, resolveProfileVerificationPolicy } from "./profileVerificationPolicy.service";

/** Applies only a proven positive SFace result; every other outcome stays manual. */
export const applyProfileVerificationAiDecision = async (input: { request: ProfileVerificationRequestDocument; result: ProfileVerificationInferenceResultDocument | null }) => {
  const policy = resolveProfileVerificationPolicy(input.request);
  // Gated analysis is deliberately shadow-only in Y4K: never use legacy .90
  // approval authority and never turn a gated conclusion into a rejection.
  if (isGatedProfileVerificationPolicy(policy)) {
    return escalateProfileVerificationRequest({ profileId: String(input.request.profileId), reasonCode: "FACE_MATCH_UNCERTAIN", reason: "Gated multi-media shadow evaluation is awaiting manual review." });
  }
  const analysis = input.result?.shadowIdentityAnalysis;
  const usableCaptureCount = input.result?.findings.crossCapture?.usableCaptureCount ?? 0;
  const exactAuthority = Boolean(input.result && String(input.result.verificationRequestId) === String(input.request._id) && String(input.result.profileId) === String(input.request.profileId) && String(input.result.userId) === String(input.request.userId) && input.result.profileSubmissionVersion === input.request.profileSubmissionVersion);
  const valid = Boolean(exactAuthority && analysis?.status === "COMPLETED" && analysis.conclusion === "LIKELY_MATCH" && Number.isFinite(analysis.similarity) && Number.isFinite(analysis.threshold) && analysis.model?.identifier === SFACE_ARTIFACT.identifier && analysis.model?.version === SFACE_ARTIFACT.version && usableCaptureCount >= SFACE_SHADOW_MINIMUM_USABLE_CAPTURES);
  if (!valid) {
    return escalateProfileVerificationRequest({ profileId: String(input.request.profileId), reasonCode: "FACE_MATCH_UNCERTAIN", reason: analysis?.reason ?? "Automated identity approval conditions were not met." });
  }
  return decideProfileVerificationRequest({ profileId: String(input.request.profileId), decision: "APPROVE", authority: "AI", expectedRequestId: String(input.request._id), expectedSubmissionVersion: input.request.profileSubmissionVersion, aiDecisionSnapshot: { source: "AI", model: analysis!.model!, similarity: analysis!.similarity!, threshold: analysis!.threshold!, decidedAt: new Date() } });
};
