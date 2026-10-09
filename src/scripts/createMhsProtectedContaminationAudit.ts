import path from "node:path";
import { compareCandidatesToProtectedFrozenBenchmark } from "../evaluation/textModeration/protectedFrozenBenchmarkContaminationDetector";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_CANDIDATE_AUDIT_FILENAME } from "../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { createMhsProtectedContaminationAudit } from "../research/textModerationDataset/mhsProtectedContaminationAudit";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const result = createMhsProtectedContaminationAudit({ candidateArtifactPath: path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME),
  integrityAuditArtifactPath: path.join(root, "candidates", MHS_CANDIDATE_AUDIT_FILENAME), outputDirectory: path.join(root, "candidates"),
  protectedDetector: compareCandidatesToProtectedFrozenBenchmark });
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256, schemaVersion: result.artifact.schemaVersion,
  contaminationPayloadDigest: result.artifact.contaminationPayloadDigest, candidateCount: result.artifact.candidateCount,
  exactMatchCount: result.artifact.exactMatchCount, normalizedMatchCount: result.artifact.normalizedMatchCount,
  fuzzyReviewCount: result.artifact.fuzzyReviewCount, contaminationStatus: result.artifact.contaminationStatus,
  semanticToolingEvaluation: result.artifact.semanticToolingEvaluation }));
