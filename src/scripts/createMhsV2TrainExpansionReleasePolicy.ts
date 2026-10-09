import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  MhsV2ReleaseInputs,
  createMhsV2TrainExpansionReleaseArtifacts,
  publishMhsV2TrainExpansionReleaseArtifacts,
} from "../research/textModerationDataset/mhsV2TrainExpansionReleasePolicy";

const root = process.cwd();
const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion");
const semantic = path.join(expansion, "semantic-calibration");
const protectedRoot = path.join(expansion, "protected-contamination");
const outputDirectory = path.join(expansion, "release-planning");

const paths = {
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"),
  acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"),
  universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"),
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"),
  consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"),
  components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"),
  graphAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-graph-analysis-v1.json"),
  graphCertification: path.join(semantic, "mhs-v2-semantic-leakage-graph-certification-v1.json"),
  collisionPolicy: path.join(semantic, "mhs-v2-historical-split-anchor-collision-policy-v1.json"),
  collisionAnalysis: path.join(semantic, "mhs-v2-historical-split-anchor-collision-analysis-v1.json"),
  collisionCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"),
  historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"),
  internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
  protectedFingerprint: path.join(protectedRoot, "sthn-text-moderation-fixtures-v1r-protected-contamination-fingerprints-v1.json"),
  protectedAnalysis: path.join(protectedRoot, "mhs-v2-protected-contamination-analysis-v1.json"),
  protectedExclusion: path.join(protectedRoot, "mhs-v2-protected-contamination-exclusion-v1.json"),
  protectedCertification: path.join(protectedRoot, "mhs-v2-protected-contamination-certification-v1.json"),
};

const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
const input = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsV2ReleaseInputs;
const first = createMhsV2TrainExpansionReleaseArtifacts(input);
const replay = createMhsV2TrainExpansionReleaseArtifacts(input);
if (canonicalJson(first) !== canonicalJson(replay)) throw new Error("T6L-7I5 deterministic replay mismatch");

const publication = publishMhsV2TrainExpansionReleaseArtifacts(first, outputDirectory);
let overwriteRefusalVerified = false;
try { publishMhsV2TrainExpansionReleaseArtifacts(first, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusalVerified = true; else throw error; }
if (!overwriteRefusalVerified) throw new Error("T6L-7I5 second publication was not refused");

const after = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("T6L-7I5 upstream authority changed");

console.log(canonicalJson({
  validationResult: "PASSED",
  ...publication,
  payloadDigests: [first.policy.policyPayloadDigest, first.feasibility.feasibilityPayloadDigest, first.plan.planPayloadDigest, first.projection.projectionPayloadDigest],
  summary: first.plan.summary,
  exactAtomicSolutionCount: first.feasibility.exactAtomicSolutionCount,
  releaseMembershipDigest: first.plan.releaseMembershipDigest,
  deterministicReplayMatched: true,
  overwriteRefusalVerified,
  upstreamHashesBefore: before,
  upstreamHashesAfter: after,
}));
