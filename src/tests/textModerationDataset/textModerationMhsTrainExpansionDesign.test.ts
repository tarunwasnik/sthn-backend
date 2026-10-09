import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MHS_PIPELINE_DATA_INVESTIGATION_SHA256 } from "../../research/textModerationDataset/mhsTrainingPipelineDataInvestigation";
import {
  MHS_TRAIN_EXPANSION_ACQUISITION_SEED,
  MHS_TRAIN_EXPANSION_DATASET_VERSION,
  MHS_TRAIN_EXPANSION_DESIGN_FILENAME,
  MHS_TRAIN_EXPANSION_DESIGN_PAYLOAD_DIGEST,
  MHS_TRAIN_EXPANSION_DESIGN_SCHEMA,
  MHS_TRAIN_EXPANSION_DESIGN_SHA256,
  MHS_TRAIN_EXPANSION_DESIGN_VERSION,
  publishMhsTrainExpansionDesign,
  readMhsTrainExpansionDesign,
  validateMhsTrainExpansionDesign,
} from "../../research/textModerationDataset/mhsTrainExpansionDesign";

const artifactPath = path.resolve(process.cwd(), "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion", MHS_TRAIN_EXPANSION_DESIGN_FILENAME);
const bytes = fs.readFileSync(artifactPath);
const artifact = readMhsTrainExpansionDesign(artifactPath, false);
const sha = (value: Buffer): string => crypto.createHash("sha256").update(value).digest("hex");
const recommendation = artifact.recommendation as Record<string, number | string>;

test("T6L-7I immutable train expansion design", async (t) => {
  const checks: readonly [string, () => void][] = [
    ["01 7H investigation SHA enforced", () => assert.equal(artifact.authorities.t6l7hInvestigationSha256, MHS_PIPELINE_DATA_INVESTIGATION_SHA256)],
    ["02 pipeline verdict fixed", () => assert.equal(artifact.priorVerdicts.pipeline, "PIPELINE_INTEGRITY_CERTIFIED")],
    ["03 data verdict drives expansion", () => assert.equal(artifact.priorVerdicts.data, "CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING")],
    ["04 current TRAIN count", () => assert.equal(artifact.currentDataset.train.total, 60)],
    ["05 current VALIDATION count", () => assert.equal(artifact.currentDataset.validation.total, 13)],
    ["06 current INTERNAL_TEST count", () => assert.equal(artifact.currentDataset.internalTest.total, 13)],
    ["07 current BLOCK count", () => assert.equal(artifact.currentDataset.train.BLOCK, 20)],
    ["08 current threat support zero", () => assert.equal(artifact.currentDataset.train.blockCategories.THREAT_OR_VIOLENCE, 0)],
    ["09 target exceeds current", () => assert.ok(Number(recommendation.futureTrainTotal) > 60)],
    ["10 BLOCK target improves", () => assert.ok(Number(recommendation.futureBlock) > 20)],
    ["11 every BLOCK category targeted", () => assert.deepEqual(Object.keys(artifact.categoryPlan).sort(), ["ABUSIVE_OR_HARASSING", "HATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"])],
    ["12 future threat target positive", () => assert.ok(artifact.categoryPlan.THREAT_OR_VIOLENCE.target > 0)],
    ["13 boundary ALLOW requirement", () => assert.equal(artifact.boundaryAllowGoals.minimumNewBoundaryAllow, 50)],
    ["14 deterministic selection", () => assert.equal(artifact.deterministicAcquisitionStrategy.seed, MHS_TRAIN_EXPANSION_ACQUISITION_SEED)],
    ["15 provenance and license gate", () => assert.deepEqual([artifact.provenanceLicenseGates.pinnedRevisionRequired, artifact.provenanceLicenseGates.attributionRequired, artifact.provenanceLicenseGates.unresolvedPiiAllowed], [true, true, false])],
    ["16 human review required", () => assert.deepEqual([artifact.reviewAdmissionFlow.required, artifact.reviewAdmissionFlow.authority, artifact.reviewAdmissionFlow.sourceLabelsFinal], [true, "SOLE_REVIEWER_A_ESTABLISHED_AUTHORITY", false])],
    ["17 semantic floor unchanged", () => assert.equal(artifact.semanticDuplicatePolicy.semanticReviewFloor, 0.85)],
    ["18 high-confidence signal unchanged", () => assert.equal(artifact.semanticDuplicatePolicy.highConfidenceSignal, 0.94)],
    ["19 duplicate and group isolation", () => assert.deepEqual([artifact.semanticDuplicatePolicy.exactAndNormalizedDuplicateAuditRequired, artifact.leakageGroupingPolicy.groupIsolationRequired], [true, true])],
    ["20 contamination protection", () => assert.deepEqual([artifact.contaminationPolicy.existingProtectedDetectorBoundaryRequired, artifact.contaminationPolicy.directProtectedContentComparisonAllowed], [true, false])],
    ["21 VALIDATION frozen", () => assert.equal(artifact.validationFreezePolicy.frozenForImmediateExpansion, true)],
    ["22 INTERNAL_TEST frozen", () => assert.deepEqual([artifact.currentDataset.internalTest.protected, artifact.boundaries.internalTestMutated], [true, false])],
    ["23 frozen 140 untouched", () => assert.deepEqual([artifact.boundaries.frozen140Mutated, artifact.boundaries.frozen140Accessed], [false, false])],
    ["24 current splits unmutated", () => assert.deepEqual([artifact.boundaries.currentTrainMutated, artifact.boundaries.validationMutated, artifact.boundaries.internalTestMutated], [false, false, false])],
    ["25 V1 immutable", () => assert.equal(artifact.versioningPlan.mutateV1, false)],
    ["26 V2 lineage", () => assert.equal(artifact.versioningPlan.futureDatasetVersion, MHS_TRAIN_EXPANSION_DATASET_VERSION)],
    ["27 run-3 gate", () => assert.deepEqual([artifact.preRun3DatasetGate.run3DesignBlockedUntilPass, artifact.preRun3DatasetGate.threatOrViolenceRequired], [true, true])],
    ["28 no acquisition", () => assert.deepEqual([artifact.boundaries.acquisitionPerformed, artifact.boundaries.candidateRowsCreated], [false, false])],
    ["29 no training", () => assert.deepEqual([artifact.boundaries.trainingPerformed, artifact.boundaries.run3ConfigCreated], [false, false])],
    ["30 canonical artifact", () => { assert.deepEqual([artifact.schemaVersion, artifact.designVersion, sha(bytes), artifact.expansionPayloadDigest], [MHS_TRAIN_EXPANSION_DESIGN_SCHEMA, MHS_TRAIN_EXPANSION_DESIGN_VERSION, MHS_TRAIN_EXPANSION_DESIGN_SHA256, MHS_TRAIN_EXPANSION_DESIGN_PAYLOAD_DIGEST]); assert.doesNotThrow(() => validateMhsTrainExpansionDesign(artifact)); }],
    ["31 overwrite refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i-overwrite-")), target = path.join(dir, "artifact.json"); try { fs.writeFileSync(target, "existing"); assert.throws(() => publishMhsTrainExpansionDesign(bytes, target), /overwrite refused/); assert.equal(fs.readFileSync(target, "utf8"), "existing"); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }],
    ["32 publication rollback", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-7i-publish-")), target = path.join(dir, "artifact.json"); try { assert.throws(() => publishMhsTrainExpansionDesign(bytes, target, () => { throw new Error("simulated publication failure"); }), /simulated publication failure/); assert.equal(fs.existsSync(target), false); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }],
  ];
  for (const [name, check] of checks) await t.test(name, check);
});
