import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MHS_REVIEWER_A_IMPORT_FILENAME } from "../research/textModerationDataset/mhsReviewImport";
import { createMhsReviewerAResolution } from "../research/textModerationDataset/mhsReviewResolution";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const result = createMhsReviewerAResolution({ sourceArtifactPath: path.join(root, "reviews", MHS_REVIEWER_A_IMPORT_FILENAME),
  parentTranchePath: path.join(root, "mhs-review-tranche-v1.jsonl"), outputDirectory: path.join(root, "reviews") });
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256,
  schemaVersion: result.artifact.schemaVersion, resolutionPayloadDigest: result.artifact.resolutionPayloadDigest,
  rowCount: result.artifact.rowCount, summary: result.artifact.summary }));
