import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_REVIEW_CSV_FILENAME, MHS_SEMANTIC_REVIEW_DIRECTORY, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME,
} from "../research/textModerationDataset/mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME, createMhsSemanticPrecisionAnalysis, createMhsSemanticValidatedReview,
  verifyMhsSemanticValidationBoundaries,
} from "../research/textModerationDataset/mhsSemanticReviewValidation";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, MHS_SEMANTIC_REVIEW_DIRECTORY);
  const candidatePath = path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME); const semanticPath = path.join(root, "candidates", MHS_SEMANTIC_AUDIT_FILENAME);
  const protectedPaths = [candidatePath, semanticPath, path.join(review, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME), path.join(review, MHS_SEMANTIC_REVIEW_CSV_FILENAME), path.join(review, MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME)];
  const before = new Map(protectedPaths.map((filename) => [filename, sha256(fs.readFileSync(filename))])); verifyMhsSemanticValidationBoundaries(candidatePath, semanticPath);
  const generatedAt = new Date().toISOString(); const validated = createMhsSemanticValidatedReview({ completedCsvPath: path.join(review, MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME),
    manifestPath: path.join(review, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME), blindedPacketPath: path.join(review, MHS_SEMANTIC_REVIEW_CSV_FILENAME), outputDirectory: review, importedAt: generatedAt });
  const precision = createMhsSemanticPrecisionAnalysis({ validatedReviewArtifactPath: validated.artifactPath, outputDirectory: review, generatedAt });
  verifyMhsSemanticValidationBoundaries(candidatePath, semanticPath); for (const filename of protectedPaths) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Semantic validation mutated protected input: ${filename}`);
  console.log(canonicalJson({ validation: { artifactPath: validated.artifactPath, artifactSha256: validated.artifactSha256,
    payloadDigest: validated.artifact.validatedReviewPayloadDigest, reviewerId: validated.artifact.reviewerId, rowCount: validated.artifact.rowCount,
    humanOutcomeCounts: validated.artifact.humanOutcomeCounts }, precision: { artifactPath: precision.artifactPath, artifactSha256: precision.artifactSha256,
    payloadDigest: precision.artifact.precisionPayloadDigest, aggregate: precision.artifact.aggregate, recommendedFutureReviewFloor: precision.artifact.recommendedFutureReviewFloor,
    highConfidenceRecommendation: precision.artifact.highConfidenceRecommendation } }));
};

main();
