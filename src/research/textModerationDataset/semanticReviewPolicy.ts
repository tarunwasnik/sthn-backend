/**
 * Current research-only semantic duplicate-review selection policy.
 *
 * This is not a moderation, toxicity, hate, profanity, production-classifier,
 * automatic-duplicate, merge, deletion, or semantic-group threshold.
 */
export const STHN_SEMANTIC_REVIEW_POLICY_VERSION = "STHN_E5_SEMANTIC_REVIEW_POLICY_V2" as const;
export const STHN_SEMANTIC_PREVIOUS_REVIEW_FLOOR = 0.8 as const;
export const STHN_SEMANTIC_REVIEW_FLOOR = 0.85 as const;
export const STHN_SEMANTIC_INVESTIGATION_BOUNDARY = 0.85 as const;
export const STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL = 0.94 as const;

export const isRoutineSemanticDuplicateReviewSignal = (similarity: number): boolean => {
  if (!Number.isFinite(similarity) || similarity < -1 || similarity > 1) throw new Error("Invalid semantic similarity");
  return similarity >= STHN_SEMANTIC_REVIEW_FLOOR;
};
