import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson, sha256 } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_RELEASE_SEED,
  MhsV2ReleaseInputs,
  createMhsV2TrainExpansionReleaseArtifacts,
  publishMhsV2TrainExpansionReleaseArtifacts,
  validateMhsV2TrainExpansionReleaseArtifacts,
} from "../../research/textModerationDataset/mhsV2TrainExpansionReleasePolicy";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), expansion = path.join(mhs, "expansion"), semantic = path.join(expansion, "semantic-calibration"), protectedRoot = path.join(expansion, "protected-contamination");
const paths = {
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"), design: path.join(expansion, "mhs-train-expansion-design-v1.json"), consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"), components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"), graphAnalysis: path.join(semantic, "mhs-v2-semantic-leakage-graph-analysis-v1.json"), graphCertification: path.join(semantic, "mhs-v2-semantic-leakage-graph-certification-v1.json"), collisionPolicy: path.join(semantic, "mhs-v2-historical-split-anchor-collision-policy-v1.json"), collisionAnalysis: path.join(semantic, "mhs-v2-historical-split-anchor-collision-analysis-v1.json"), collisionCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"),
  historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), protectedFingerprint: path.join(protectedRoot, "sthn-text-moderation-fixtures-v1r-protected-contamination-fingerprints-v1.json"), protectedAnalysis: path.join(protectedRoot, "mhs-v2-protected-contamination-analysis-v1.json"), protectedExclusion: path.join(protectedRoot, "mhs-v2-protected-contamination-exclusion-v1.json"), protectedCertification: path.join(protectedRoot, "mhs-v2-protected-contamination-certification-v1.json"),
};
const input = (): MhsV2ReleaseInputs => Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsV2ReleaseInputs;
const authority = input(), artifacts = createMhsV2TrainExpansionReleaseArtifacts(authority), { policy, feasibility, plan, projection } = artifacts;
const released = projection.rows.filter((row) => row.disposition === "RELEASED_TO_TRAIN"), reserve = projection.rows.filter((row) => row.disposition === "RESEARCH_RESERVE_NOT_RELEASED"), excluded = projection.rows.filter((row) => row.disposition === "EXCLUDED_FROM_TRAIN_AND_VALIDATION");
const consolidation = JSON.parse(authority.consolidationBytes.toString("utf8")) as { rows: readonly { candidateId: string; decision: string; primaryCategory: string | null; secondaryCategories: readonly string[]; reasonCode: string }[] };

const cases: readonly [string, () => void][] = [
  ["01 candidate authority validates", () => assert.equal(policy.authorities.candidateSha256, sha256(authority.candidateBytes))],
  ["02 universe authority validates", () => assert.equal(policy.authorities.universeSha256, sha256(authority.universeBytes))],
  ["03 expansion design validates", () => assert.equal(policy.authorities.designSha256, sha256(authority.designBytes))],
  ["04 consolidation validates", () => assert.equal(policy.authorities.consolidationSha256, sha256(authority.consolidationBytes))],
  ["05 graph validates", () => assert.equal(policy.authorities.graphSha256, sha256(authority.graphBytes))],
  ["06 component authority validates", () => assert.equal(policy.authorities.componentsSha256, sha256(authority.componentsBytes))],
  ["07 CQ validates", () => assert.equal(policy.authorities.cqCertificationSha256, sha256(authority.collisionCertificationBytes))],
  ["08 contamination certification validates", () => assert.equal(policy.authorities.protectedCertificationSha256, sha256(authority.protectedCertificationBytes))],
  ["09 historical split validates", () => assert.equal(policy.authorities.historicalSplitSha256, sha256(authority.historicalSplitBytes))],
  ["10 INTERNAL_TEST freeze validates", () => assert.equal(policy.authorities.internalTestFreezeSha256, sha256(authority.internalTestFreezeBytes))],
  ["11 combined TRAIN target is 200", () => assert.equal(policy.targets.combinedTrain, 200)],
  ["12 historical TRAIN is 60", () => assert.equal(policy.targets.historicalTrain, 60)],
  ["13 V2 TRAIN target is 140", () => assert.equal(policy.targets.v2Train, 140)],
  ["14 V2 ALLOW target is 70", () => assert.equal(policy.targets.v2Allow, 70)],
  ["15 V2 BLOCK target is 70", () => assert.equal(policy.targets.v2Block, 70)],
  ["16 V2 VALIDATION target is zero", () => assert.equal(policy.targets.v2Validation, 0)],
  ["17 V2 INTERNAL_TEST target is zero", () => assert.equal(policy.targets.v2InternalTest, 0)],
  ["18 CQ is excluded before selection", () => assert.equal(plan.components.find((row) => row.componentId.includes("74809df3"))?.disposition, "EXCLUDED_FROM_TRAIN_AND_VALIDATION")],
  ["19 mandatory TRAIN anchor included", () => assert.equal(plan.components.find((row) => row.componentId.includes("e53063ce"))?.disposition, "RELEASED_TO_TRAIN")],
  ["20 exact atomic feasibility checked", () => assert.equal(feasibility.exactAtomicSolutionExists, true)],
  ["21 exact 140 selected", () => assert.equal(released.length, 140)],
  ["22 exact 70 ALLOW selected", () => assert.equal(released.filter((row) => row.decision === "ALLOW").length, 70)],
  ["23 exact 70 BLOCK selected", () => assert.equal(released.filter((row) => row.decision === "BLOCK").length, 70)],
  ["24 no partial component selection", () => assert.equal(plan.summary.partialComponentViolations, 0)],
  ["25 same seed is frozen", () => assert.equal(policy.selection.seed, MHS_V2_RELEASE_SEED)],
  ["26 canonical component ordering", () => assert.deepEqual(plan.components.map((row) => row.componentId), [...plan.components.map((row) => row.componentId)].sort())],
  ["27 stable SHA tie breaking", () => assert.equal(policy.selection.ranking, "SHA256_CANONICAL_JSON_SEED_AND_COMPONENT_ID")],
  ["28 replay release digest is identical", () => assert.equal(createMhsV2TrainExpansionReleaseArtifacts(authority).plan.releaseMembershipDigest, plan.releaseMembershipDigest)],
  ["29 no runtime randomness in authority", () => assert.equal(canonicalJson(createMhsV2TrainExpansionReleaseArtifacts(authority)), canonicalJson(artifacts))],
  ["30 selected disposition is TRAIN release", () => assert.ok(released.every((row) => row.disposition === "RELEASED_TO_TRAIN"))],
  ["31 non-selected eligible is reserve", () => assert.equal(reserve.length, 256)],
  ["32 CQ candidates are genuine exclusion", () => assert.equal(excluded.length, 4)],
  ["33 reserve is not leakage exclusion", () => assert.ok(reserve.every((row) => row.releaseReason === "VALID_REVIEWED_RESEARCH_RESERVE"))],
  ["34 reserve retains human decisions", () => assert.ok(reserve.every((row) => consolidation.rows.find((source) => source.candidateId === row.candidateId)?.decision === row.decision))],
  ["35 excluded remains in projection", () => assert.ok(excluded.every((row) => projection.rows.includes(row)))],
  ["36 mandatory TRAIN component released", () => assert.equal(plan.summary.anchorViolations, 0)],
  ["37 anchor counts inside 140", () => assert.ok(released.some((row) => row.componentId.includes("e53063ce")))],
  ["38 anchor is not an extra candidate", () => assert.equal(plan.summary.releasedCandidates, 140)],
  ["39 no V2 VALIDATION", () => assert.equal(plan.summary.v2ValidationCandidates, 0)],
  ["40 no V2 INTERNAL_TEST", () => assert.equal(plan.summary.v2InternalTestCandidates, 0)],
  ["41 historical VALIDATION stays 13", () => assert.equal(JSON.parse(authority.historicalSplitBytes.toString("utf8")).splitSummary.VALIDATION.candidateCount, 13)],
  ["42 historical INTERNAL_TEST stays 13", () => assert.equal(JSON.parse(authority.historicalSplitBytes.toString("utf8")).splitSummary.INTERNAL_TEST.candidateCount, 13)],
  ["43 INTERNAL_TEST raw content not accessed", () => assert.equal(feasibility.internalTestRawAccesses, 0)],
  ["44 C authority is read-only bound", () => assert.equal(policy.authorities.protectedExclusionSha256, sha256(authority.protectedExclusionBytes))],
  ["45 benchmark raw content not accessed", () => assert.equal(feasibility.protectedBenchmarkRawAccesses, 0)],
  ["46 protected contamination remains zero", () => assert.deepEqual([feasibility.counts.protectedExcludedCandidates, feasibility.counts.protectedExcludedComponents], [0, 0])],
  ["47 HMAC secret is not required", () => { const old = process.env.TEXT_MODERATION_PROTECTED_CONTAMINATION_HMAC_KEY; delete process.env.TEXT_MODERATION_PROTECTED_CONTAMINATION_HMAC_KEY; try { assert.equal(createMhsV2TrainExpansionReleaseArtifacts(authority).plan.summary.releasedCandidates, 140); } finally { if (old !== undefined) process.env.TEXT_MODERATION_PROTECTED_CONTAMINATION_HMAC_KEY = old; } }],
  ["48 E5 invocation is zero", () => assert.equal(feasibility.e5Invocations, 0)],
  ["49 semantic threshold is absent", () => assert.equal(feasibility.threshold, null)],
  ["50 classifier inference is zero", () => assert.equal(feasibility.modelInvocations, 0)],
  ["51 model training is absent", () => assert.equal(policy.boundaries.trainingPerformed, false)],
  ["52 release membership does not grant eligibility", () => assert.equal(policy.eligibility.splitOrReleaseMembershipGrantsTrainingEligibility, false)],
  ["53 trainingEligible remains false", () => assert.ok(projection.rows.every((row) => row.trainingEligible === false))],
  ["54 category floors are preserved", () => { const counts = plan.summary.releasedBlockCategories; for (const [category, minimum] of Object.entries(policy.stratification.requiredV2CategoryMinimums)) assert.ok((counts[category] ?? 0) >= minimum); }],
  ["55 policy and outputs contain no raw text field", () => assert.doesNotMatch(canonicalJson(artifacts), /"text"\s*:/u)],
  ["56 projection has exact unique membership", () => assert.equal(new Set(projection.rows.map((row) => row.candidateId)).size, 400)],
  ["57 release membership digest is bound", () => assert.equal(projection.releaseMembershipDigest, plan.releaseMembershipDigest)],
  ["58 canonical validators pass", () => validateMhsV2TrainExpansionReleaseArtifacts(policy, feasibility, plan, projection)],
];
for (const [name, check] of cases) test(name, check);

test("59 deterministic publication and overwrite refusal", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t6l-7i5-publish-")); try { const published = publishMhsV2TrainExpansionReleaseArtifacts(artifacts, directory); assert.equal(published.paths.length, 4); assert.throws(() => publishMhsV2TrainExpansionReleaseArtifacts(artifacts, directory), /overwrite refused/u); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("60 partial publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t6l-7i5-rollback-")); try { assert.throws(() => publishMhsV2TrainExpansionReleaseArtifacts(artifacts, directory, (temporary, targets) => { fs.renameSync(temporary[0], targets[0]); throw new Error("synthetic failure"); }), /synthetic failure/u); assert.deepEqual(fs.readdirSync(directory), []); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("61 upstream authorities remain byte-identical", () => { const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))])); createMhsV2TrainExpansionReleaseArtifacts(authority); const after = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha256(fs.readFileSync(filename))])); assert.deepEqual(after, before); });
test("62 corrupt authority fails closed", () => assert.throws(() => createMhsV2TrainExpansionReleaseArtifacts({ ...authority, componentsBytes: Buffer.concat([authority.componentsBytes, Buffer.from(" ")]) }), /components authority mismatch/u));
