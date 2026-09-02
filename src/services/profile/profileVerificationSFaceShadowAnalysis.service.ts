import { cosineSimilarity, normalizeFaceEmbeddingL2 } from "./profileVerificationFaceEmbedding.service";
import { SFACE_ARTIFACT, SFACE_FACE_EMBEDDING_SPECIFICATION } from "./profileVerificationFaceEmbeddingAdapter";
import { ProfileVerificationShadowIdentityAnalysis } from "./profileVerificationInference.types";

export const SFACE_SHADOW_MINIMUM_USABLE_CAPTURES = 3;

export const medianSFaceSimilarity = (values: readonly number[]) => {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
};

/** Produces only bounded shadow output; all embeddings stay in the current call stack. */
export const analyseSFaceShadowIdentity = (input: {
  referenceEmbedding: unknown;
  usableCaptureEmbeddings: readonly unknown[];
  threshold: number | null;
  processedAt?: Date;
}): ProfileVerificationShadowIdentityAnalysis => {
  const processedAt = input.processedAt ?? new Date();
  const model = { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version };
  const reference = normalizeFaceEmbeddingL2(input.referenceEmbedding, SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions);
  const similarities = input.usableCaptureEmbeddings.map((embedding) => cosineSimilarity(reference, embedding, SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
  if (similarities.length < SFACE_SHADOW_MINIMUM_USABLE_CAPTURES) {
    return { status: "COMPLETED", conclusion: "UNABLE_TO_DETERMINE", model, processedAt, reasonCode: "INSUFFICIENT_USABLE_CAPTURES", reason: "Fewer than three usable live captures produced embeddings." };
  }
  const similarity = medianSFaceSimilarity(similarities);
  if (input.threshold === null) {
    return { status: "COMPLETED", conclusion: "UNABLE_TO_DETERMINE", similarity, model, processedAt, reasonCode: "THRESHOLD_NOT_CONFIGURED", reason: "No configured threshold is available for this shadow analysis." };
  }
  if (!Number.isFinite(input.threshold) || input.threshold < -1 || input.threshold > 1) throw new Error("SFace shadow threshold is invalid");
  return {
    status: "COMPLETED",
    conclusion: similarity >= input.threshold ? "LIKELY_MATCH" : "LIKELY_MISMATCH",
    similarity,
    threshold: input.threshold,
    model,
    processedAt,
  };
};
