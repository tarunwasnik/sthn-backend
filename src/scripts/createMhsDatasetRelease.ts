import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import { createMhsDatasetRelease } from "../research/textModerationDataset/mhsDatasetRelease";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const candidates = path.join(root, "candidates");
const splits = path.join(root, "splits");

const result = createMhsDatasetRelease({
  candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"),
  candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  splitManifestPath: path.join(splits, "mhs-split-manifest-v1.json"),
  internalTestFreezePath: path.join(splits, "mhs-internal-test-freeze-v1.json"),
  rEligibilityPlanPath: path.join(root, "release", "mhs-training-eligibility-release-plan-v1.json"),
  semanticOverlayPath: path.join(root, "semantic-review", "mhs-semantic-grouping-overlay-v1.json"),
  groupingUnionPlanPath: path.join(root, "grouping", "mhs-grouping-union-split-plan-v1.json"),
  contaminationAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-contamination-audit.json"),
  acquisitionManifestPath: path.resolve(process.cwd(), "dataset-research", "text-moderation", "acquisition-manifest.json"),
  outputDirectory: path.join(root, "release"),
});

process.stdout.write(`${canonicalJson({
  authorizationDecision: result.authorizationDecision,
  datasetVersion: result.release.datasetVersion,
  releaseVersion: result.release.releaseVersion,
  releasePath: result.releasePath,
  releaseSha256: result.releaseSha256,
  releasePayloadDigest: result.release.releasePayloadDigest,
  eligibilityPath: result.eligibilityPath,
  eligibilitySha256: result.eligibilitySha256,
  eligibilityPayloadDigest: result.eligibility.eligibilityPayloadDigest,
  counts: result.eligibility.counts,
})}\n`);
