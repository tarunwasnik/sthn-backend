import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_CANDIDATE_AUDIT_FILENAME } from "../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { createMhsSemanticIntegrityAudit } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import { MHS_CONTAMINATION_AUDIT_FILENAME } from "../research/textModerationDataset/mhsProtectedContaminationAudit";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates");
void createMhsSemanticIntegrityAudit({ candidateArtifactPath: path.join(candidates, MHS_CANDIDATE_ARTIFACT_FILENAME),
  integrityAuditArtifactPath: path.join(candidates, MHS_CANDIDATE_AUDIT_FILENAME), contaminationAuditArtifactPath: path.join(candidates, MHS_CONTAMINATION_AUDIT_FILENAME),
  outputDirectory: candidates }).then((result) => console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256,
    semanticAuditPayloadDigest: result.artifact.semanticAuditPayloadDigest, candidateCount: result.artifact.candidateCount, pairCount: result.artifact.pairCount,
    highConfidenceSignalCount: result.artifact.highConfidenceSignalCount, potentialNearDuplicateSignalCount: result.artifact.potentialNearDuplicateSignalCount,
    allowBlockConflictSignalCount: result.artifact.allowBlockConflictSignalCount, blockClassificationConflictSignalCount: result.artifact.blockClassificationConflictSignalCount,
    sameDecisionSignalCount: result.artifact.sameDecisionSignalCount }))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Semantic audit failed"); process.exitCode = 1; });
