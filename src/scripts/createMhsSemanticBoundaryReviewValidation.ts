import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME, MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME,
} from "../research/textModerationDataset/mhsSemanticBoundaryReviewPacket";
import {
  MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME, createMhsSemanticBoundaryAnalysis,
  createMhsSemanticBoundaryValidatedReview, verifyMhsSemanticBoundaryValidationAuthorities,
} from "../research/textModerationDataset/mhsSemanticBoundaryReviewValidation";
import {
  MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME,
} from "../research/textModerationDataset/mhsSemanticReviewValidation";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const review = path.join(root, "semantic-review");
  const candidatePath = path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME);
  const semanticPath = path.join(root, "candidates", MHS_SEMANTIC_AUDIT_FILENAME);
  const completedPath = path.join(review, MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME);
  const manifestPath = path.join(review, MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME);
  const blindedPath = path.join(review, MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME);
  const hValidatedPath = path.join(review, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME);
  const hPrecisionPath = path.join(review, MHS_SEMANTIC_PRECISION_FILENAME);
  const protectedPaths = [candidatePath, semanticPath, completedPath, manifestPath, blindedPath, hValidatedPath, hPrecisionPath];
  const before = new Map(protectedPaths.map((filename) => [filename, sha256(fs.readFileSync(filename))]));

  verifyMhsSemanticBoundaryValidationAuthorities(candidatePath, semanticPath);
  const generatedAt = new Date().toISOString();
  const validated = createMhsSemanticBoundaryValidatedReview({
    completedCsvPath: completedPath, manifestPath, blindedPacketPath: blindedPath, outputDirectory: review, importedAt: generatedAt,
  });
  const analysis = createMhsSemanticBoundaryAnalysis({
    validatedBoundaryArtifactPath: validated.artifactPath, hValidatedArtifactPath: hValidatedPath,
    hPrecisionArtifactPath: hPrecisionPath, outputDirectory: review, generatedAt,
  });
  verifyMhsSemanticBoundaryValidationAuthorities(candidatePath, semanticPath);
  for (const filename of protectedPaths) {
    if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Boundary validation mutated protected input: ${filename}`);
  }

  console.log(canonicalJson({
    validation: { artifactPath: validated.artifactPath, artifactSha256: validated.artifactSha256,
      payloadDigest: validated.artifact.validatedBoundaryPayloadDigest, reviewerId: validated.artifact.reviewerId,
      rowCount: validated.artifact.rowCount, humanOutcomeCounts: validated.artifact.humanOutcomeCounts },
    analysis: { artifactPath: analysis.artifactPath, artifactSha256: analysis.artifactSha256,
      payloadDigest: analysis.artifact.boundaryAnalysisPayloadDigest, recommendation: analysis.artifact.futureReviewFloorRecommendation,
      highConfidenceRecommendation: analysis.artifact.highConfidenceRecommendation },
  }));
};

main();
