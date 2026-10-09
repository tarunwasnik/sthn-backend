import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME, MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME,
  MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME,
} from "../research/textModerationDataset/mhsSemanticBoundaryReviewValidation";
import { MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME } from "../research/textModerationDataset/mhsSemanticBoundaryReviewPacket";
import { createMhsSemanticReviewFloorAuthorization } from "../research/textModerationDataset/mhsSemanticReviewFloorAuthorization";
import { MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME } from "../research/textModerationDataset/mhsSemanticReviewValidation";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates"); const review = path.join(root, "semantic-review");
  const paths = { candidatePath: path.join(candidates, MHS_CANDIDATE_ARTIFACT_FILENAME), semanticPath: path.join(candidates, MHS_SEMANTIC_AUDIT_FILENAME),
    hValidatedPath: path.join(review, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME), hPrecisionPath: path.join(review, MHS_SEMANTIC_PRECISION_FILENAME),
    jValidatedPath: path.join(review, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME), jAnalysisPath: path.join(review, MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME),
    jCompletedPath: path.join(review, MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME), jManifestPath: path.join(review, MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME) };
  const protectedPaths = Object.values(paths); const before = new Map(protectedPaths.map((filename) => [filename, sha256(fs.readFileSync(filename))]));
  const result = createMhsSemanticReviewFloorAuthorization({ ...paths, candidateOutputDirectory: candidates, reviewOutputDirectory: review });
  for (const filename of protectedPaths) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Review-floor authorization mutated upstream authority: ${filename}`);
  console.log(canonicalJson({ decision: result.authorization.decision, authorizationArtifactPath: result.authorizationPath,
    authorizationArtifactSha256: result.authorizationSha256, authorizationPayloadDigest: result.authorization.authorizationPayloadDigest,
    semanticAuditPath: result.semanticAuditPath, semanticAuditSha256: result.semanticAuditSha256, semanticAuditPayloadDigest: result.semanticAudit.semanticAuditPayloadDigest,
    currentRoutineReviewPairs: result.authorization.currentContractImpact.routineReviewPairCount, authorizedRoutineReviewPairs: result.authorization.proposedContractImpact.routineReviewPairCount,
    duplicateLikeRetained: result.authorization.humanEvidence.duplicateLikeRetained, duplicateLikeLost: result.authorization.humanEvidence.duplicateLikeLost }));
};

main();
