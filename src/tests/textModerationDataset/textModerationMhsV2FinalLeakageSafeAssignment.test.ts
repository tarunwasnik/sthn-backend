import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson, sha256 } from "../../research/textModerationDataset/manifest";
import {
  MhsV2FinalAssignmentInputs, createMhsV2FinalLeakageSafeAssignment,
  publishMhsV2FinalLeakageSafeAssignment, validateMhsV2FinalLeakageSafeAssignment,
} from "../../research/textModerationDataset/mhsV2FinalLeakageSafeAssignment";

const root = path.resolve(__dirname, "../../.."), mhs = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), expansion = path.join(mhs, "expansion"), semantic = path.join(expansion, "semantic-calibration"), protectedRoot = path.join(expansion, "protected-contamination"), release = path.join(expansion, "release-planning");
const paths = {
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"), design: path.join(expansion, "mhs-train-expansion-design-v1.json"), consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"), graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"), components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"), graphAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-graph-analysis-v1.json"), graphCertification: path.join(semantic, "mhs-v2-semantic-leakage-graph-certification-v1.json"), collisionPolicy: path.join(semantic, "mhs-v2-historical-split-anchor-collision-policy-v1.json"), collisionAnalysis: path.join(semantic, "mhs-v2-historical-split-anchor-collision-analysis-v1.json"), collisionCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"), historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), protectedFingerprint: path.join(protectedRoot, "sthn-text-moderation-fixtures-v1r-protected-contamination-fingerprints-v1.json"), protectedAnalysis: path.join(protectedRoot, "mhs-v2-protected-contamination-analysis-v1.json"), protectedExclusion: path.join(protectedRoot, "mhs-v2-protected-contamination-exclusion-v1.json"), protectedCertification: path.join(protectedRoot, "mhs-v2-protected-contamination-certification-v1.json"), leakagePolicy: path.join(semantic, "mhs-v2-semantic-leakage-control-policy-v1.json"), leakageAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-control-analysis-v1.json"), leakageCertification: path.join(semantic, "mhs-v2-semantic-leakage-control-certification-v1.json"), releasePolicy: path.join(release, "mhs-v2-train-expansion-release-policy-v1.json"), releaseFeasibility: path.join(release, "mhs-v2-train-expansion-release-feasibility-v1.json"), releasePlan: path.join(release, "mhs-v2-train-expansion-release-plan-v1.json"), releaseProjection: path.join(release, "mhs-v2-train-expansion-candidate-release-projection-v1.json"),
};
const input = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsV2FinalAssignmentInputs;
const artifacts = createMhsV2FinalLeakageSafeAssignment(input), { componentAssignment, candidateProjection, analysis, certification } = artifacts;
const released = candidateProjection.rows.filter((row) => row.releaseDisposition === "RELEASED_TO_TRAIN"), reserve = candidateProjection.rows.filter((row) => row.releaseDisposition === "RESEARCH_RESERVE_NOT_RELEASED"), excluded = candidateProjection.rows.filter((row) => row.releaseDisposition === "EXCLUDED_FROM_TRAIN_AND_VALIDATION");
const releasedComponents = componentAssignment.components.filter((row) => row.releaseDisposition === "RELEASED_TO_TRAIN"), reserveComponents = componentAssignment.components.filter((row) => row.releaseDisposition === "RESEARCH_RESERVE_NOT_RELEASED"), excludedComponents = componentAssignment.components.filter((row) => row.releaseDisposition === "EXCLUDED_FROM_TRAIN_AND_VALIDATION");
const cases: readonly [string, () => void][] = [
  ["01 candidate authority validates", () => assert.equal(certification.authorities.candidateSha256, sha256(input.candidateBytes))],
  ["02 universe validates", () => assert.equal(certification.authorities.universeSha256, sha256(input.universeBytes))],
  ["03 consolidation validates", () => assert.equal(certification.authorities.consolidationSha256, sha256(input.consolidationBytes))],
  ["04 historical split validates", () => assert.equal(certification.authorities.historicalSplitSha256, sha256(input.historicalSplitBytes))],
  ["05 internal freeze validates", () => assert.equal(certification.authorities.internalTestFreezeSha256, sha256(input.internalTestFreezeBytes))],
  ["06 leakage policy validates", () => assert.equal(certification.authorities.leakagePolicySha256, sha256(input.leakagePolicyBytes))],
  ["07 graph validates", () => assert.equal(certification.authorities.graphSha256, sha256(input.graphBytes))],
  ["08 components validate", () => assert.equal(certification.authorities.componentsSha256, sha256(input.componentsBytes))],
  ["09 CQ validates", () => assert.equal(certification.authorities.cqCertificationSha256, sha256(input.collisionCertificationBytes))],
  ["10 protected certification validates", () => assert.equal(certification.authorities.protectedCertificationSha256, sha256(input.protectedCertificationBytes))],
  ["11 7I5 policy validates", () => assert.equal(certification.authorities.releasePolicySha256, sha256(input.releasePolicyBytes))],
  ["12 7I5 feasibility validates", () => assert.equal(certification.authorities.releaseFeasibilitySha256, sha256(input.releaseFeasibilityBytes))],
  ["13 7I5 plan validates", () => assert.equal(certification.authorities.releasePlanSha256, sha256(input.releasePlanBytes))],
  ["14 7I5 projection validates", () => assert.equal(certification.authorities.releaseProjectionSha256, sha256(input.releaseProjectionBytes))],
  ["15 candidates 400", () => assert.equal(candidateProjection.rows.length, 400)],
  ["16 components 393", () => assert.equal(componentAssignment.components.length, 393)],
  ["17 released candidates 140", () => assert.equal(released.length, 140)],
  ["18 released components 138", () => assert.equal(releasedComponents.length, 138)],
  ["19 released ALLOW 70", () => assert.equal(released.filter((row) => row.moderationDecision === "ALLOW").length, 70)],
  ["20 released BLOCK 70", () => assert.equal(released.filter((row) => row.moderationDecision === "BLOCK").length, 70)],
  ["21 reserve candidates 256", () => assert.equal(reserve.length, 256)],
  ["22 reserve components 254", () => assert.equal(reserveComponents.length, 254)],
  ["23 excluded candidates 4", () => assert.equal(excluded.length, 4)],
  ["24 excluded components 1", () => assert.equal(excludedComponents.length, 1)],
  ["25 component totals 393", () => assert.equal(releasedComponents.length + reserveComponents.length + excludedComponents.length, 393)],
  ["26 candidate totals 400", () => assert.equal(released.length + reserve.length + excluded.length, 400)],
  ["27 release digest matches", () => assert.equal(certification.authorities.releaseMembershipDigest, "2e01d8d52fd167ed091f67fa42017cbfa50c8aaa64d420adacc92d548b23bcf2")],
  ["28 selected component digest matches", () => assert.equal(certification.authorities.selectedComponentDigest, "8fc79cb77b5940d491fbb9184c3b14c299ca7844eb66dfd16afc8d0ac80237c3")],
  ["29 no reselection authority", () => assert.equal(certification.certification.noReselectionAuthority, true)],
  ["30 anchor released", () => assert.equal(componentAssignment.components.find((row) => row.componentId.includes("e53063ce"))?.releaseDisposition, "RELEASED_TO_TRAIN")],
  ["31 CQ excluded", () => assert.equal(excludedComponents[0].cqExcluded, true)],
  ["32 protected exclusions zero", () => assert.equal(analysis.invariants.protectedContaminationExclusions, 0)],
  ["33 no partial components", () => assert.equal(analysis.invariants.partialComponentViolations, 0)],
  ["34 no TRAIN reserve span", () => assert.equal(analysis.invariants.crossDispositionComponentViolations, 0)],
  ["35 no TRAIN excluded span", () => assert.equal(analysis.invariants.crossDispositionComponentViolations, 0)],
  ["36 no reserve excluded span", () => assert.equal(analysis.invariants.crossDispositionComponentViolations, 0)],
  ["37 released size-two intact", () => assert.equal(releasedComponents.filter((row) => row.componentSize === 2).length, 2)],
  ["38 reserve size-three intact", () => assert.equal(reserveComponents.filter((row) => row.componentSize === 3).length, 1)],
  ["39 excluded size-four intact", () => assert.equal(excludedComponents[0].componentSize, 4)],
  ["40 V2 validation zero", () => assert.equal(analysis.combinedDevelopment.v2Validation, 0)],
  ["41 V2 internal zero", () => assert.equal(analysis.combinedDevelopment.v2InternalTest, 0)],
  ["42 historical TRAIN unchanged", () => assert.equal(analysis.combinedDevelopment.historicalTrain, 60)],
  ["43 historical validation unchanged", () => assert.equal(analysis.combinedDevelopment.historicalValidation, 13)],
  ["44 historical internal unchanged", () => assert.equal(analysis.combinedDevelopment.historicalInternalTest, 13)],
  ["45 labels unchanged", () => assert.deepEqual(analysis.total.frozenDecisionCounts, { ALLOW: 232, BLOCK: 168 })],
  ["46 released 70/70 records", () => assert.deepEqual(analysis.dispositions.RELEASED_TO_TRAIN.decisionCounts, { ALLOW: 70, BLOCK: 70 })],
  ["47 reserve 162/94 records", () => assert.deepEqual(analysis.dispositions.RESEARCH_RESERVE_NOT_RELEASED.decisionCounts, { ALLOW: 162, BLOCK: 94 })],
  ["48 excluded labels verified", () => assert.equal(Object.values(analysis.dispositions.EXCLUDED_FROM_TRAIN_AND_VALIDATION.decisionCounts).reduce((a, b) => a + b, 0), 4)],
  ["49 released categories verified", () => assert.deepEqual(analysis.dispositions.RELEASED_TO_TRAIN.blockCategoryCounts, { ABUSIVE_OR_HARASSING: 12, HATE: 12, PROFANITY: 20, SEXUAL: 11, THREAT_OR_VIOLENCE: 15 })],
  ["50 no category mutation", () => assert.equal(analysis.invariants.labelMutations, 0)],
  ["51 no reason mutation", () => assert.equal(analysis.invariants.reasonMutations, 0)],
  ["52 eligibility preserved", () => assert.equal(analysis.invariants.eligibilityMutations, 0)],
  ["53 no premature eligibility", () => assert.equal(candidateProjection.trainingEligibleCount, 0)],
  ["54 reserve ineligible", () => assert.ok(reserve.every((row) => !row.trainingEligible))],
  ["55 excluded ineligible", () => assert.ok(excluded.every((row) => !row.trainingEligible))],
  ["56 protected raw not accessed", () => assert.equal(analysis.boundaries.protectedBenchmarkRawAccesses, 0)],
  ["57 internal raw not accessed", () => assert.equal(analysis.boundaries.internalTestRawAccesses, 0)],
  ["58 no HMAC secret serialized", () => assert.doesNotMatch(canonicalJson(artifacts), /HMAC_KEY|secret/iu)],
  ["59 no raw text serialized", () => assert.doesNotMatch(canonicalJson(artifacts), /"text"\s*:/u)],
  ["60 E5 zero", () => assert.equal(analysis.boundaries.e5Invocations, 0)],
  ["61 classifier zero", () => assert.equal(analysis.boundaries.classifierInvocations, 0)],
  ["62 threshold null", () => assert.equal(analysis.boundaries.threshold, null)],
  ["63 no training", () => assert.equal(analysis.boundaries.trainingPerformed, false)],
  ["64 canonical validators pass", () => validateMhsV2FinalLeakageSafeAssignment(componentAssignment, candidateProjection, analysis, certification)],
  ["65 deterministic replay", () => assert.equal(canonicalJson(createMhsV2FinalLeakageSafeAssignment(input)), canonicalJson(artifacts))],
  ["66 release is TRAIN", () => assert.ok(released.every((row) => row.split === "TRAIN"))],
  ["67 reserve is UNASSIGNED", () => assert.ok(reserve.every((row) => row.split === "UNASSIGNED"))],
  ["68 excluded is UNASSIGNED", () => assert.ok(excluded.every((row) => row.split === "UNASSIGNED"))],
  ["69 reserve is not exclusion", () => assert.ok(reserve.every((row) => row.releaseDisposition === "RESEARCH_RESERVE_NOT_RELEASED"))],
  ["70 assignment digest bound", () => assert.equal(componentAssignment.assignmentMembershipDigest, certification.assignmentMembershipDigest)],
];
for (const [name, check] of cases) test(name, check);

test("71 publication is immutable and replay-refusing", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t6l-7kd-")); try { assert.equal(publishMhsV2FinalLeakageSafeAssignment(artifacts, directory).paths.length, 4); assert.throws(() => publishMhsV2FinalLeakageSafeAssignment(artifacts, directory), /overwrite refused/u); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("72 partial publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t6l-7kd-")); try { assert.throws(() => publishMhsV2FinalLeakageSafeAssignment(artifacts, directory, (temporary, targets) => { fs.renameSync(temporary[0], targets[0]); throw new Error("synthetic failure"); }), /synthetic failure/u); assert.deepEqual(fs.readdirSync(directory), []); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("73 upstream bytes remain identical", () => { const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))])); createMhsV2FinalLeakageSafeAssignment(input); const after = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))])); assert.deepEqual(after, before); });
test("74 corrupted 7I5 authority fails closed", () => assert.throws(() => createMhsV2FinalLeakageSafeAssignment({ ...input, releasePlanBytes: Buffer.concat([input.releasePlanBytes, Buffer.from(" ")]) }), /7I5 release plan authority mismatch/u));
test("75 corrupted protected certification fails closed", () => assert.throws(() => createMhsV2FinalLeakageSafeAssignment({ ...input, protectedCertificationBytes: Buffer.concat([input.protectedCertificationBytes, Buffer.from(" ")]) }), /protected certification authority mismatch/u));
