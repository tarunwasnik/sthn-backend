import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { importMhsReviewerA } from "../research/textModerationDataset/mhsReviewImport";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const result = importMhsReviewerA({
  packetPath: path.join(root, "mhs-review-pilot-v1-reviewer-a-CORRECTED.csv"),
  parentTranchePath: path.join(root, "mhs-review-tranche-v1.jsonl"),
  outputDirectory: path.join(root, "reviews"),
});
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256,
  schemaVersion: result.artifact.schemaVersion, reviewerRole: result.artifact.reviewerRole,
  reviewerId: result.artifact.reviewerId, rowCount: result.artifact.rowCount,
  payloadIntegrityDigest: result.artifact.payloadIntegrityDigest }));
