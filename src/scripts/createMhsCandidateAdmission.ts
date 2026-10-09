import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MHS_REVIEWER_A_IMPORT_FILENAME } from "../research/textModerationDataset/mhsReviewImport";
import { MHS_REVIEWER_A_RESOLUTION_FILENAME } from "../research/textModerationDataset/mhsReviewResolution";
import { createMhsCandidateAdmission } from "../research/textModerationDataset/mhsCandidateAdmission";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const result = createMhsCandidateAdmission({
  resolutionArtifactPath: path.join(root, "reviews", MHS_REVIEWER_A_RESOLUTION_FILENAME),
  reviewerArtifactPath: path.join(root, "reviews", MHS_REVIEWER_A_IMPORT_FILENAME),
  parentTranchePath: path.join(root, "mhs-review-tranche-v1.jsonl"), outputDirectory: path.join(root, "candidates"),
});
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256,
  schemaVersion: result.artifact.schemaVersion, candidatePayloadDigest: result.artifact.candidatePayloadDigest,
  rowCount: result.artifact.rowCount, summary: result.artifact.summary }));
