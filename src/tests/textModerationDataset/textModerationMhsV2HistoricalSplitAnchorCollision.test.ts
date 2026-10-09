import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson, sha256 } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_COLLISION_ANALYSIS_FILENAME,
  MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST,
  MHS_V2_COLLISION_ANALYSIS_SHA256,
  MHS_V2_COLLISION_CANDIDATE_ID,
  MHS_V2_COLLISION_CERTIFICATION_FILENAME,
  MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_COLLISION_CERTIFICATION_SHA256,
  MHS_V2_COLLISION_DISPOSITION,
  MHS_V2_COLLISION_POLICY_FILENAME,
  MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST,
  MHS_V2_COLLISION_POLICY_SHA256,
  MHS_V2_COLLISION_REASON,
  collisionQuarantineAppliesToComponent,
  createMhsV2CollisionAnalysis,
  createMhsV2CollisionCertification,
  createMhsV2CollisionPolicy,
  deriveHistoricalAnchorConstraints,
  publishMhsV2CollisionAuthority,
  validateMhsV2CollisionAnalysis,
  validateMhsV2CollisionCertification,
  validateMhsV2CollisionPolicy,
} from "../../research/textModerationDataset/mhsV2HistoricalSplitAnchorCollision";
import { reconcileMhsV2SemanticCalibrationRows } from "../../research/textModerationDataset/mhsV2SemanticCalibrationEvaluation";
import { MhsSplitManifestArtifact } from "../../research/textModerationDataset/mhsSplitManifest";
import { MhsV2ExpansionConsolidationArtifact } from "../../research/textModerationDataset/mhsV2ExpansionConsolidation";

const root = path.resolve(__dirname, "../../.."), directory = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration"), mhsRoot = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), semanticRoot = path.join(root, "evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e");
const read = (filename: string): Buffer => fs.readFileSync(filename);
const calibration = (filename: string): Buffer => read(path.join(directory, filename));
const evaluationInputs = { policyBytes: calibration("mhs-v2-semantic-calibration-policy-v1.json"), membershipBytes: calibration("mhs-v2-semantic-calibration-pair-membership-v1.json"), blindedCsv: calibration("mhs-v2-semantic-calibration-reviewer-a-v1-blinded.csv").toString("utf8"), completedCsv: calibration("mhs-v2-semantic-calibration-reviewer-a-v1-completed.csv").toString("utf8"), reviewCertificationBytes: calibration("mhs-v2-semantic-calibration-reviewer-a-v1-certification.json"), e5ContractBytes: read(path.join(root, "src/research/textModerationDataset/semanticSimilarity/E5_SMALL_SEMANTIC_CONTRACT.md")), e5ExportManifestBytes: read(path.join(semanticRoot, "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json")), e5RuntimeCertificationBytes: read(path.join(semanticRoot, "certification/node-runtime-certification.json")) };
const inputs = { evaluationInputs, evaluationBytes: calibration("mhs-v2-semantic-calibration-evaluation-v1.json"), evaluationCertificationBytes: calibration("mhs-v2-semantic-calibration-evaluation-certification-v1.json"), consolidationBytes: read(path.join(mhsRoot, "expansion/certification/mhs-v2-expansion-consolidation-certification-v1.json")), historicalSplitManifestBytes: read(path.join(mhsRoot, "splits/mhs-split-manifest-v1.json")), internalTestFreezeMetadataBytes: read(path.join(mhsRoot, "splits/mhs-internal-test-freeze-v1.json")) };
const joined = reconcileMhsV2SemanticCalibrationRows(evaluationInputs), split = JSON.parse(inputs.historicalSplitManifestBytes.toString("utf8")) as MhsSplitManifestArtifact, consolidation = JSON.parse(inputs.consolidationBytes.toString("utf8")) as MhsV2ExpansionConsolidationArtifact;
const constraints = deriveHistoricalAnchorConstraints(joined, split.candidateMembershipIndex), policy = createMhsV2CollisionPolicy(inputs), analysis = createMhsV2CollisionAnalysis(inputs), certification = createMhsV2CollisionCertification(policy, analysis);

test("A1R-CQ reproduces exactly one frozen TRAIN/VALIDATION collision", () => {
  const collisions = constraints.filter((constraint) => constraint.collision); assert.equal(collisions.length, 1); assert.equal(collisions[0].v2CandidateId, MHS_V2_COLLISION_CANDIDATE_ID); assert.deepEqual(collisions[0].frozenSplits, ["TRAIN", "VALIDATION"]);
  assert.deepEqual(collisions[0].anchors.map((anchor) => [anchor.reviewRowNumber, anchor.relationship, anchor.frozenSplit]), [[11, "NEAR_DUPLICATE", "TRAIN"], [107, "DUPLICATE", "VALIDATION"]]);
  assert.notEqual(collisions[0].anchors[0].historicalComponentId, collisions[0].anchors[1].historicalComponentId);
});

test("A1R-CQ preserves the exact historical anchors and frozen memberships", () => {
  const collision = constraints.find((constraint) => constraint.collision)!; const train = split.candidateMembershipIndex.find((row) => row.candidateId === collision.anchors[0].historicalCandidateId), validation = split.candidateMembershipIndex.find((row) => row.candidateId === collision.anchors[1].historicalCandidateId);
  assert.deepEqual([train?.split, train?.unionComponentId], ["TRAIN", "union_f0fa3cf5b02e27ededf6ebd375af81482ba490acc27bdd1d049130cb04e8e201"]); assert.deepEqual([validation?.split, validation?.unionComponentId], ["VALIDATION", "union_1b52a4ae6e80d0f168cca6ab0f673ac9df71a2543183817c8f611f4fc77c70de"]);
  assert.equal(analysis.findings.historicalAnchorsMoved, 0);
});

test("A1R-CQ freezes bounded non-punitive placement quarantine", () => {
  assert.equal(policy.rule.reasonCode, MHS_V2_COLLISION_REASON); assert.equal(policy.rule.incompatibleDevelopmentSplitsDisposition, MHS_V2_COLLISION_DISPOSITION); assert.equal(certification.result.componentPropagationFrozen, true);
  assert.equal(analysis.findings.newCandidateAssignedTrain, false); assert.equal(analysis.findings.newCandidateAssignedValidation, false); assert.equal(analysis.findings.newCandidateAssignedInternalTest, false); assert.equal(analysis.findings.trainingEligibilityChanged, false); assert.equal(analysis.findings.candidateDeleted, false);
});

test("A1R-CQ leaves current V2 state and moderation authority intact", () => {
  const candidate = consolidation.rows.find((row) => row.candidateId === MHS_V2_COLLISION_CANDIDATE_ID)!; assert.equal(candidate.split, "UNASSIGNED"); assert.equal(candidate.trainingEligible, false); assert.equal(consolidation.rows.filter((row) => row.trainingEligible).length, 0); assert.equal(consolidation.rows.filter((row) => row.split !== "UNASSIGNED").length, 0);
  assert.equal(analysis.findings.moderationLabelsChanged, false); assert.equal(analysis.findings.humanEvidenceRemoved, false); assert.equal(analysis.findings.semanticEvidenceChanged, false); assert.match(analysis.collisionCandidate.moderationBindingDigest, /^[a-f0-9]{64}$/u);
});

test("A1R-CQ quarantine propagates to a complete future V2 component", () => {
  const quarantined = new Set([MHS_V2_COLLISION_CANDIDATE_ID]); assert.equal(collisionQuarantineAppliesToComponent(["x", MHS_V2_COLLISION_CANDIDATE_ID, "y"], quarantined), true); assert.equal(collisionQuarantineAppliesToComponent(["x", "y"], quarantined), false);
});

test("A1R-CQ generalized anchor cardinality rule is deterministic", () => {
  const scopeB = joined.filter((row) => row.scope === "B" && (row.relationship === "DUPLICATE" || row.relationship === "NEAR_DUPLICATE")); const row11 = scopeB.find((row) => row.reviewRowNumber === 11)!, row107 = scopeB.find((row) => row.reviewRowNumber === 107)!;
  assert.equal(deriveHistoricalAnchorConstraints([], split.candidateMembershipIndex).length, 0); assert.equal(deriveHistoricalAnchorConstraints([row11], split.candidateMembershipIndex)[0].collision, false); assert.equal(deriveHistoricalAnchorConstraints([row107], split.candidateMembershipIndex)[0].collision, false); assert.equal(deriveHistoricalAnchorConstraints([row11, { ...row11, reviewRowNumber: 12, pairId: `${row11.pairId}:repeat` }], split.candidateMembershipIndex)[0].collision, false); assert.equal(deriveHistoricalAnchorConstraints([row11, row107], split.candidateMembershipIndex)[0].collision, true);
  assert.equal(canonicalJson(deriveHistoricalAnchorConstraints([...joined].reverse(), split.candidateMembershipIndex)), canonicalJson(constraints));
});

test("A1R-CQ selects no threshold and needs no protected content", () => {
  assert.deepEqual(policy.threshold, { globalThresholdAuthorized: false, value0_85Authorized: false, diagnosticMinimumAuthorized: false }); assert.equal(analysis.findings.thresholdSelected, false); assert.equal(certification.boundaries.internalTestContentAccessed, false); assert.equal(certification.boundaries.protectedBenchmarkContentAccessed, false); assert.doesNotMatch(canonicalJson([policy, analysis, certification]), /"text"\s*:/u);
});

test("A1R-CQ artifacts replay and validate deterministically", () => {
  const replayPolicy = createMhsV2CollisionPolicy(inputs), replayAnalysis = createMhsV2CollisionAnalysis(inputs), replayCertification = createMhsV2CollisionCertification(replayPolicy, replayAnalysis); assert.equal(canonicalJson(replayPolicy), canonicalJson(policy)); assert.equal(canonicalJson(replayAnalysis), canonicalJson(analysis)); assert.equal(canonicalJson(replayCertification), canonicalJson(certification)); validateMhsV2CollisionPolicy(policy); validateMhsV2CollisionAnalysis(analysis); validateMhsV2CollisionCertification(certification);
});

test("A1R-CQ publication is atomic and overwrite-refusing", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-a1rcq-")); try { publishMhsV2CollisionAuthority(policy, analysis, certification, target); assert.throws(() => publishMhsV2CollisionAuthority(policy, analysis, certification, target), /overwrite refused/u); } finally { fs.rmSync(target, { recursive: true, force: true }); }
  const failed = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-a1rcq-")); try { assert.throws(() => publishMhsV2CollisionAuthority(policy, analysis, certification, failed, (a, b) => { fs.renameSync(a, b); throw new Error("simulated"); }), /simulated/u); assert.equal(fs.existsSync(path.join(failed, MHS_V2_COLLISION_POLICY_FILENAME)), false); assert.equal(fs.existsSync(path.join(failed, MHS_V2_COLLISION_ANALYSIS_FILENAME)), false); assert.equal(fs.existsSync(path.join(failed, MHS_V2_COLLISION_CERTIFICATION_FILENAME)), false); } finally { fs.rmSync(failed, { recursive: true, force: true }); }
});

test("A1R-CQ fails closed on corrupt upstream authorities and protected anchors", () => {
  assert.throws(() => createMhsV2CollisionPolicy({ ...inputs, evaluationBytes: Buffer.concat([inputs.evaluationBytes, Buffer.from(" ")]) }), /evaluation SHA/u); assert.throws(() => createMhsV2CollisionPolicy({ ...inputs, consolidationBytes: Buffer.concat([inputs.consolidationBytes, Buffer.from(" ")]) }), /consolidation SHA/u); assert.throws(() => createMhsV2CollisionPolicy({ ...inputs, historicalSplitManifestBytes: Buffer.concat([inputs.historicalSplitManifestBytes, Buffer.from(" ")]) }), /split manifest SHA/u); assert.throws(() => createMhsV2CollisionPolicy({ ...inputs, internalTestFreezeMetadataBytes: Buffer.concat([inputs.internalTestFreezeMetadataBytes, Buffer.from(" ")]) }), /freeze metadata SHA/u);
  const scopeB = joined.find((row) => row.reviewRowNumber === 11)!; const protectedMembership = split.candidateMembershipIndex.map((row) => row.candidateId === scopeB.candidateBId ? { ...row, split: "INTERNAL_TEST" as const } : row); assert.throws(() => deriveHistoricalAnchorConstraints([scopeB], protectedMembership), /protected INTERNAL_TEST/u);
});

test("A1R-CQ rejects policy, analysis, and certification corruption", () => {
  assert.throws(() => validateMhsV2CollisionPolicy({ ...policy, nextPhase: "bad" as never }), /Invalid A1R-CQ/u); assert.throws(() => validateMhsV2CollisionAnalysis({ ...analysis, collisionGroupCount: 2 as never }), /Invalid A1R-CQ/u); assert.throws(() => validateMhsV2CollisionCertification({ ...certification, certificationPayloadDigest: "0".repeat(64) }), /Invalid A1R-CQ/u);
});

test("A1R-CQ validates immutable publications when present", () => {
  const paths = [MHS_V2_COLLISION_POLICY_FILENAME, MHS_V2_COLLISION_ANALYSIS_FILENAME, MHS_V2_COLLISION_CERTIFICATION_FILENAME].map((filename) => path.join(directory, filename)); if (paths.every((filename) => !fs.existsSync(filename))) return; assert.ok(paths.every((filename) => fs.existsSync(filename))); assert.equal(fs.readFileSync(paths[0], "utf8"), canonicalJson(policy)); assert.equal(fs.readFileSync(paths[1], "utf8"), canonicalJson(analysis)); assert.equal(fs.readFileSync(paths[2], "utf8"), canonicalJson(certification)); assert.ok(paths.every((filename) => /^[a-f0-9]{64}$/u.test(sha256(fs.readFileSync(filename)))));
  assert.deepEqual([sha256(fs.readFileSync(paths[0])), policy.policyPayloadDigest, sha256(fs.readFileSync(paths[1])), analysis.analysisPayloadDigest, sha256(fs.readFileSync(paths[2])), certification.certificationPayloadDigest], [MHS_V2_COLLISION_POLICY_SHA256, MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST, MHS_V2_COLLISION_ANALYSIS_SHA256, MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST, MHS_V2_COLLISION_CERTIFICATION_SHA256, MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST]);
});
