import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_CANDIDATE_AUDIT_FILENAME } from "../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import { MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME } from "../research/textModerationDataset/mhsSemanticBoundaryReviewValidation";
import {
  MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME, MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME,
} from "../research/textModerationDataset/mhsSemanticReviewFloorAuthorization";
import { createMhsReviewedSemanticApplicationContract } from "../research/textModerationDataset/mhsReviewedSemanticApplicationContract";
import { MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME } from "../research/textModerationDataset/mhsSemanticReviewValidation";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates"); const review = path.join(root, "semantic-review");
  const paths = { candidatePath: path.join(candidates, MHS_CANDIDATE_ARTIFACT_FILENAME), candidateIntegrityPath: path.join(candidates, MHS_CANDIDATE_AUDIT_FILENAME),
    currentSemanticAuditPath: path.join(candidates, MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME), historicalSemanticAuditPath: path.join(candidates, MHS_SEMANTIC_AUDIT_FILENAME),
    hValidatedPath: path.join(review, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME), hPrecisionPath: path.join(review, MHS_SEMANTIC_PRECISION_FILENAME),
    jValidatedPath: path.join(review, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME), jAnalysisPath: path.join(review, MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME),
    lAuthorizationPath: path.join(review, MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME) };
  const protectedPaths = Object.values(paths); const before = new Map(protectedPaths.map((filename) => [filename, sha256(fs.readFileSync(filename))]));
  const result = createMhsReviewedSemanticApplicationContract({ ...paths, outputDirectory: review });
  for (const filename of protectedPaths) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Semantic application dry run mutated upstream authority: ${filename}`);
  console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256, payloadDigest: result.artifact.applicationContractPayloadDigest,
    status: result.artifact.status, knownReviewedSummary: result.artifact.knownReviewedSummary, dryRunImpact: result.artifact.dryRunImpact,
    components: result.artifact.dryRunComponents }));
};

main();
