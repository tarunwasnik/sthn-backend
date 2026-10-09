import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MhsCombinedReleaseInputs, createMhsCombinedDatasetRelease, publishMhsCombinedDatasetRelease } from "../research/textModerationDataset/mhsCombinedDatasetRelease";

const root = process.cwd();
const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion");
const semantic = path.join(expansion, "semantic-calibration");
const releasePlanning = path.join(expansion, "release-planning");
const finalAssignment = path.join(expansion, "final-assignment");
const paths = {
  oldRelease: path.join(mhs, "release/mhs-release-manifest-v1.json"),
  oldEligibility: path.join(mhs, "release/mhs-training-eligibility-manifest-v1.json"),
  oldEligibilityPlan: path.join(mhs, "release/mhs-training-eligibility-release-plan-v1.json"),
  historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"),
  internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"),
  universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"),
  consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  leakagePolicy: path.join(semantic, "mhs-v2-semantic-leakage-control-policy-v1.json"),
  graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"),
  components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"),
  cqCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"),
  protectedCertification: path.join(expansion, "protected-contamination/mhs-v2-protected-contamination-certification-v1.json"),
  releasePolicy: path.join(releasePlanning, "mhs-v2-train-expansion-release-policy-v1.json"),
  releaseFeasibility: path.join(releasePlanning, "mhs-v2-train-expansion-release-feasibility-v1.json"),
  releasePlan: path.join(releasePlanning, "mhs-v2-train-expansion-release-plan-v1.json"),
  releaseProjection: path.join(releasePlanning, "mhs-v2-train-expansion-candidate-release-projection-v1.json"),
  componentAssignment: path.join(finalAssignment, "mhs-v2-final-leakage-safe-component-assignment-v1.json"),
  candidateAssignment: path.join(finalAssignment, "mhs-v2-final-leakage-safe-candidate-assignment-projection-v1.json"),
  assignmentAnalysis: path.join(finalAssignment, "mhs-v2-final-leakage-safe-assignment-analysis-v1.json"),
  assignmentCertification: path.join(finalAssignment, "mhs-v2-final-leakage-safe-assignment-certification-v1.json"),
};

const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
const input = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsCombinedReleaseInputs;
const first = createMhsCombinedDatasetRelease(input);
const replay = createMhsCombinedDatasetRelease(input);
if (canonicalJson(first) !== canonicalJson(replay)) throw new Error("T6L-8A0 deterministic replay mismatch");
const publication = publishMhsCombinedDatasetRelease(first, path.join(mhs, "release"));
let overwriteRefusalVerified = false;
try { publishMhsCombinedDatasetRelease(first, path.join(mhs, "release")); } catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusalVerified = true; else throw error; }
if (!overwriteRefusalVerified) throw new Error("T6L-8A0 second publication was not refused");
const after = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("T6L-8A0 upstream authority changed");
process.stdout.write(`${canonicalJson({ validationResult: "PASSED", ...publication, releasePayloadDigest: first.release.releasePayloadDigest, eligibilityPayloadDigest: first.eligibility.eligibilityPayloadDigest, releaseAuthorityId: first.release.releaseAuthorityId, membershipDigests: first.release.membershipDigests, releaseContent: first.release.releaseContent, eligibilityCounts: first.eligibility.counts, deterministicReplayMatched: true, overwriteRefusalVerified, upstreamHashesBefore: before, upstreamHashesAfter: after })}\n`);
