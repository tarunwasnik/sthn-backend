import { Y4E_FACE_MEMBERSHIP_THRESHOLD, Y4E_MULTI_FACE_MIN_MARGIN } from "../../evaluation/y4ProfileMediaPolicy.service";
import { ProfileVerificationProfileMediaShadowAnalysis } from "./profileVerificationInference.types";
import { ProfileVerificationGate2MediaAdmission, evaluateProfileVerificationGate2MediaAdmission } from "./profileVerificationGate2MediaAdmission.service";

type ShadowMedia = ProfileVerificationProfileMediaShadowAnalysis["media"][number];
export type ProfileVerificationGate3Conclusion = "LIKELY_MATCH" | "LIKELY_MISMATCH" | "UNABLE_TO_DETERMINE";
export type ProfileVerificationGate3ReasonCode = "LIVE_ANCHOR_NOT_ACCEPTED" | "MEDIA_SNAPSHOT_UNAVAILABLE" | "MANDATORY_AVATAR_UNAVAILABLE" | "CONTRADICTORY_IDENTITY_EVIDENCE";
export type ProfileVerificationGate3IdentityPolicyResult = {
  conclusion: ProfileVerificationGate3Conclusion;
  reasonCode?: ProfileVerificationGate3ReasonCode;
  avatarMembership: "PERSON_A_SUPPORTED" | "PERSON_A_NOT_ESTABLISHED" | "TECHNICAL_UNAVAILABLE";
  avatarMedianSimilarity?: number;
  optionalMediaWithPersonA: number;
  optionalClearPersonACandidateCount: number;
  optionalAmbiguousMediaCount: number;
  optionalTechnicalFailureCount: number;
};

const unavailable = (reasonCode: ProfileVerificationGate3ReasonCode): ProfileVerificationGate3IdentityPolicyResult => ({ conclusion: "UNABLE_TO_DETERMINE", reasonCode, avatarMembership: "TECHNICAL_UNAVAILABLE", optionalMediaWithPersonA: 0, optionalClearPersonACandidateCount: 0, optionalAmbiguousMediaCount: 0, optionalTechnicalFailureCount: 0 });
const optionalSummary = (media: readonly ShadowMedia[]) => {
  let optionalMediaWithPersonA = 0; let optionalClearPersonACandidateCount = 0; let optionalAmbiguousMediaCount = 0; let optionalTechnicalFailureCount = 0;
  for (const item of media.filter(item => item.role !== "AVATAR")) {
    if (item.status === "MEDIA_READ_FAILED" || item.status === "NO_USABLE_FACE") { optionalTechnicalFailureCount += 1; continue; }
    if (item.status !== "FACE_CANDIDATES_AVAILABLE" || !item.bestCandidate || item.bestCandidate.medianSimilarity < Y4E_FACE_MEMBERSHIP_THRESHOLD) continue;
    if (item.candidateCount > 1 && (item.bestVsSecondMargin === undefined || item.bestVsSecondMargin < Y4E_MULTI_FACE_MIN_MARGIN)) { optionalAmbiguousMediaCount += 1; continue; }
    optionalMediaWithPersonA += 1; optionalClearPersonACandidateCount += 1;
  }
  return { optionalMediaWithPersonA, optionalClearPersonACandidateCount, optionalAmbiguousMediaCount, optionalTechnicalFailureCount };
};

/**
 * Pure Gate-3 shadow policy. Optional foreign/no-face evidence is neutral;
 * only clear optional Person-A evidence can make an avatar non-match contradictory.
 */
export const evaluateProfileVerificationGate3IdentityPolicy = (input: { gate1Accepted: boolean; analysis: ProfileVerificationProfileMediaShadowAnalysis; gate2?: ProfileVerificationGate2MediaAdmission }): ProfileVerificationGate3IdentityPolicyResult => {
  if (!input.gate1Accepted) return unavailable("LIVE_ANCHOR_NOT_ACCEPTED");
  const gate2 = input.gate2 ?? evaluateProfileVerificationGate2MediaAdmission(input.analysis);
  if (gate2.status === "MEDIA_SNAPSHOT_UNAVAILABLE") return unavailable("MEDIA_SNAPSHOT_UNAVAILABLE");
  if (gate2.status !== "READY_FOR_GATE3") return unavailable("MANDATORY_AVATAR_UNAVAILABLE");
  const avatar = input.analysis.media.find(item => item.role === "AVATAR");
  if (!avatar?.bestCandidate || avatar.status !== "FACE_CANDIDATES_AVAILABLE" || avatar.usableFaceCount !== 1) return unavailable("MANDATORY_AVATAR_UNAVAILABLE");
  const summary = optionalSummary(input.analysis.media);
  const avatarMedianSimilarity = avatar.bestCandidate.medianSimilarity;
  if (avatarMedianSimilarity >= Y4E_FACE_MEMBERSHIP_THRESHOLD) return { conclusion: "LIKELY_MATCH", avatarMembership: "PERSON_A_SUPPORTED", avatarMedianSimilarity, ...summary };
  if (summary.optionalClearPersonACandidateCount > 0) return { conclusion: "UNABLE_TO_DETERMINE", reasonCode: "CONTRADICTORY_IDENTITY_EVIDENCE", avatarMembership: "PERSON_A_NOT_ESTABLISHED", avatarMedianSimilarity, ...summary };
  return { conclusion: "LIKELY_MISMATCH", avatarMembership: "PERSON_A_NOT_ESTABLISHED", avatarMedianSimilarity, ...summary };
};
