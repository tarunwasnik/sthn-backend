import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_REVIEWER_A_IMPORT_FILENAME } from "../research/textModerationDataset/mhsReviewImport";
import { MHS_REVIEWER_A_RESOLUTION_FILENAME } from "../research/textModerationDataset/mhsReviewResolution";
import { createMhsCandidateIntegrityAudit } from "../research/textModerationDataset/mhsCandidateIntegrityAudit";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const result = createMhsCandidateIntegrityAudit({ candidateArtifactPath: path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME),
  resolutionArtifactPath: path.join(root, "reviews", MHS_REVIEWER_A_RESOLUTION_FILENAME), reviewerArtifactPath: path.join(root, "reviews", MHS_REVIEWER_A_IMPORT_FILENAME),
  parentTranchePath: path.join(root, "mhs-review-tranche-v1.jsonl"), outputDirectory: path.join(root, "candidates") });
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256, schemaVersion: result.artifact.schemaVersion,
  auditPayloadDigest: result.artifact.auditPayloadDigest, admittedRowCount: result.artifact.admittedRowCount, semanticAudit: result.artifact.semanticAudit,
  contaminationAudit: result.artifact.contaminationAudit, lineageAudit: result.artifact.lineageAudit, summary: result.artifact.summary }));
