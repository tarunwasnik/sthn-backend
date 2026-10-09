import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MhsV2FinalAssignmentInputs, createMhsV2FinalLeakageSafeAssignment, publishMhsV2FinalLeakageSafeAssignment } from "../research/textModerationDataset/mhsV2FinalLeakageSafeAssignment";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), expansion = path.join(mhs, "expansion"), semantic = path.join(expansion, "semantic-calibration"), protectedRoot = path.join(expansion, "protected-contamination"), release = path.join(expansion, "release-planning"), outputDirectory = path.join(expansion, "final-assignment");
const paths = {
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"), design: path.join(expansion, "mhs-train-expansion-design-v1.json"), consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"), components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"), graphAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-graph-analysis-v1.json"), graphCertification: path.join(semantic, "mhs-v2-semantic-leakage-graph-certification-v1.json"), collisionPolicy: path.join(semantic, "mhs-v2-historical-split-anchor-collision-policy-v1.json"), collisionAnalysis: path.join(semantic, "mhs-v2-historical-split-anchor-collision-analysis-v1.json"), collisionCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"),
  historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), protectedFingerprint: path.join(protectedRoot, "sthn-text-moderation-fixtures-v1r-protected-contamination-fingerprints-v1.json"), protectedAnalysis: path.join(protectedRoot, "mhs-v2-protected-contamination-analysis-v1.json"), protectedExclusion: path.join(protectedRoot, "mhs-v2-protected-contamination-exclusion-v1.json"), protectedCertification: path.join(protectedRoot, "mhs-v2-protected-contamination-certification-v1.json"),
  leakagePolicy: path.join(semantic, "mhs-v2-semantic-leakage-control-policy-v1.json"), leakageAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-control-analysis-v1.json"), leakageCertification: path.join(semantic, "mhs-v2-semantic-leakage-control-certification-v1.json"), releasePolicy: path.join(release, "mhs-v2-train-expansion-release-policy-v1.json"), releaseFeasibility: path.join(release, "mhs-v2-train-expansion-release-feasibility-v1.json"), releasePlan: path.join(release, "mhs-v2-train-expansion-release-plan-v1.json"), releaseProjection: path.join(release, "mhs-v2-train-expansion-candidate-release-projection-v1.json"),
};
const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
const input = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsV2FinalAssignmentInputs;
const first = createMhsV2FinalLeakageSafeAssignment(input), replay = createMhsV2FinalLeakageSafeAssignment(input);
if (canonicalJson(first) !== canonicalJson(replay)) throw new Error("T6L-7K-D deterministic replay mismatch");
const publication = publishMhsV2FinalLeakageSafeAssignment(first, outputDirectory);
let overwriteRefusalVerified = false;
try { publishMhsV2FinalLeakageSafeAssignment(first, outputDirectory); } catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusalVerified = true; else throw error; }
if (!overwriteRefusalVerified) throw new Error("T6L-7K-D second publication was not refused");
const after = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("T6L-7K-D upstream authority changed");
console.log(canonicalJson({ validationResult: "PASSED", ...publication, payloadDigests: [first.componentAssignment.componentAssignmentPayloadDigest, first.candidateProjection.candidateProjectionPayloadDigest, first.analysis.analysisPayloadDigest, first.certification.certificationPayloadDigest], assignmentMembershipDigest: first.certification.assignmentMembershipDigest, analysis: first.analysis, deterministicReplayMatched: true, overwriteRefusalVerified, upstreamHashesBefore: before, upstreamHashesAfter: after }));
