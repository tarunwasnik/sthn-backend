/** Evaluation-only Y4E policy layer. No production decision service imports this module. */
export const Y4E_FACE_MEMBERSHIP_THRESHOLD = 0.36;
export const Y4E_MULTI_FACE_MIN_MARGIN = 0.04;
export type Y4EMediaState = "IDENTITY_MATCH" | "IDENTITY_MISMATCH" | "IDENTITY_AMBIGUOUS" | "FACE_NOT_PRESENT" | "TECHNICALLY_UNUSABLE";
export type Y4EMediaEvidence = { state: Y4EMediaState; bestScore?: number; margin?: number };
export type Y4EProfileEvidence = { totalSubmittedMediaCount: number; faceNotPresentCount: number; technicallyUnusableCount: number; ambiguousCount: number; usableIdentityEvidenceCount: number; matchCount: number; mismatchCount: number; matchRatio: number; mismatchRatio: number };

export const classifyY4EMedia = (input: { status: "NO_FACE" | "NO_USABLE_FACE" | "MEDIA_READ_FAILED" | "FACE_CANDIDATES_AVAILABLE"; candidateCount: number; bestScore?: number; margin?: number }): Y4EMediaEvidence => {
  if (input.status === "NO_FACE") return { state: "FACE_NOT_PRESENT" };
  if (input.status !== "FACE_CANDIDATES_AVAILABLE" || input.bestScore === undefined) return { state: "TECHNICALLY_UNUSABLE" };
  if (input.bestScore < Y4E_FACE_MEMBERSHIP_THRESHOLD) return { state: "IDENTITY_MISMATCH", bestScore: input.bestScore };
  if (input.candidateCount > 1 && (input.margin === undefined || input.margin < Y4E_MULTI_FACE_MIN_MARGIN)) return { state: "IDENTITY_AMBIGUOUS", bestScore: input.bestScore, ...(input.margin === undefined ? {} : { margin: input.margin }) };
  return { state: "IDENTITY_MATCH", bestScore: input.bestScore, ...(input.margin === undefined ? {} : { margin: input.margin }) };
};

export const summarizeY4EProfile = (items: readonly Y4EMediaEvidence[]): Y4EProfileEvidence => {
  const matchCount = items.filter(item => item.state === "IDENTITY_MATCH").length;
  const mismatchCount = items.filter(item => item.state === "IDENTITY_MISMATCH").length;
  const usableIdentityEvidenceCount = matchCount + mismatchCount;
  return { totalSubmittedMediaCount: items.length, faceNotPresentCount: items.filter(item => item.state === "FACE_NOT_PRESENT").length, technicallyUnusableCount: items.filter(item => item.state === "TECHNICALLY_UNUSABLE").length, ambiguousCount: items.filter(item => item.state === "IDENTITY_AMBIGUOUS").length, usableIdentityEvidenceCount, matchCount, mismatchCount, matchRatio: usableIdentityEvidenceCount ? matchCount / usableIdentityEvidenceCount : 0, mismatchRatio: usableIdentityEvidenceCount ? mismatchCount / usableIdentityEvidenceCount : 0 };
};

export type Y4EPolicyOutcome = "LIKELY_MATCH" | "LIKELY_MISMATCH" | "AMBIGUOUS_OR_INSUFFICIENT";
export const evaluateY4EPolicy = (evidence: Y4EProfileEvidence, input: { minimumUsable: number; minimumMatches: number; matchRatio: number; mismatchRatioForLikelyMismatch: number; requireNoMismatch?: boolean }): Y4EPolicyOutcome => {
  if (evidence.usableIdentityEvidenceCount < input.minimumUsable) return "AMBIGUOUS_OR_INSUFFICIENT";
  if (evidence.matchCount >= input.minimumMatches && evidence.matchRatio >= input.matchRatio && (!input.requireNoMismatch || evidence.mismatchCount === 0)) return "LIKELY_MATCH";
  if (evidence.mismatchRatio >= input.mismatchRatioForLikelyMismatch && evidence.matchCount === 0) return "LIKELY_MISMATCH";
  return "AMBIGUOUS_OR_INSUFFICIENT";
};
