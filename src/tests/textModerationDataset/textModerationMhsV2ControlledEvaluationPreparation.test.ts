import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  createMhsV2ControlledEvaluationPreparation,
  defaultMhsV2ControlledEvaluationPreparationPaths,
  MHS_V2_CONTROLLED_EVALUATION_PREPARATION_FILENAME,
  MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256,
  MHS_V2_CONTROLLED_EVALUATION_RUNNER_SHA256,
  MHS_V2_CONTROLLED_EVALUATION_SOURCE_BRIDGE_SHA256,
  MhsV2ControlledEvaluationPreparationArtifact,
  publishMhsV2ControlledEvaluationPreparation,
  validateMhsV2ControlledEvaluationPreparation,
} from "../../research/textModerationDataset/mhsV2ControlledEvaluationPreparation";

const root = process.cwd(), paths = defaultMhsV2ControlledEvaluationPreparationPaths(root), artifact = createMhsV2ControlledEvaluationPreparation(paths, { preflightPassed: true, selfTestPassed: true });
const clone = (): MhsV2ControlledEvaluationPreparationArtifact => structuredClone(artifact), sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const preparationPath = path.join(path.dirname(paths.contract), MHS_V2_CONTROLLED_EVALUATION_PREPARATION_FILENAME);
const revision = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", python = path.resolve(root, `evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/${revision}/.venv/Scripts/python.exe`), pythonTests = path.resolve(root, "src/tests/textModerationDataset/test_mhs_v2_controlled_evaluation_runner.py");
const runnerSource = fs.readFileSync(paths.runner, "utf8"), sourceModule = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts"), "utf8");

test("01 exact 8D-A authority is bound", () => assert.deepEqual([(artifact.authorities as any).controlledEvaluationContractSha256, (artifact.authorities as any).controlledEvaluationContractPayloadDigest], ["1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e", "9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b"]));
test("02 exact 8C3 authority is bound", () => assert.deepEqual([(artifact.authorities as any).trainingCertificationSha256, (artifact.authorities as any).trainingCertificationPayloadDigest], ["43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a", "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47"]));
test("03 candidate SHA exact", () => assert.equal((artifact.authorities as any).candidateSha256, "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79"));
test("04 tokenizer identities exact", () => assert.deepEqual([(artifact.authorities as any).tokenizerSha256, (artifact.authorities as any).tokenizerBindingSha256], ["a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c", "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"]));
test("05 INTERNAL_TEST authority exact", () => assert.deepEqual([(artifact.authorities as any).internalTestFreezeSha256, (artifact.authorities as any).internalTestMembershipDigest], ["11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13"]));
test("06 benchmark authority exact", () => assert.deepEqual([(artifact.authorities as any).externalBenchmarkVersion, (artifact.authorities as any).externalBenchmarkSha256], ["STHN_TEXT_MODERATION_FIXTURES_V1R", "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"]));
test("07 runner and bridge hashes exact", () => assert.deepEqual([(artifact.runner as any).sha256, (artifact.runner as any).sourceBridgeSha256], [MHS_V2_CONTROLLED_EVALUATION_RUNNER_SHA256, MHS_V2_CONTROLLED_EVALUATION_SOURCE_BRIDGE_SHA256]));
test("08 runner modes are narrow", () => assert.deepEqual((artifact.runner as any).modes, ["--preflight", "--self-test", "--execute-authorized-local-evaluation"]));
test("09 arbitrary overrides prohibited", () => assert.equal((artifact.runner as any).arbitraryOverridesAccepted, false));
test("10 CPU FP32 batch eight", () => assert.deepEqual([(artifact.configuration as any).device, (artifact.configuration as any).precision, (artifact.configuration as any).batchSize], ["CPU", "FP32", 8]));
test("11 max length and labels exact", () => assert.deepEqual([(artifact.configuration as any).maxLength, (artifact.configuration as any).labels], [160, { ALLOW: 0, BLOCK: 1 }]));
test("12 argmax and tie exact", () => assert.deepEqual([(artifact.configuration as any).evaluationDecisionRule, (artifact.configuration as any).implementationRule, (artifact.configuration as any).tieRule], ["ARGMAX_TWO_LOGITS", "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", "LOWEST_LABEL_INDEX_ALLOW"]));
test("13 production threshold unselected", () => assert.equal((artifact.configuration as any).productionThresholdStatus, "NOT_SELECTED"));
test("14 eval no-grad no-shuffle", () => assert.deepEqual([(artifact.configuration as any).modelEval, (artifact.configuration as any).gradients, (artifact.configuration as any).shuffle], [true, false, false]));
test("15 optimizer and scheduler absent", () => assert.deepEqual([(artifact.configuration as any).optimizer, (artifact.configuration as any).scheduler], [null, null]));
test("16 exact metric set frozen", () => assert.deepEqual(artifact.metrics, ["COUNT", "GROUND_TRUTH_COUNTS", "PREDICTED_COUNTS", "CONFUSION_MATRIX", "ACCURACY", "ALLOW_PRECISION", "ALLOW_RECALL", "ALLOW_F1", "BLOCK_PRECISION", "BLOCK_RECALL", "BLOCK_F1", "MACRO_F1", "BALANCED_ACCURACY"]));
test("17 raw protected text persistence prohibited", () => assert.equal((artifact.privacy as any).rawProtectedTextPersisted, false));
test("18 lifecycle ledger contains no raw text", () => assert.equal((artifact.privacy as any).exposureLedgerContainsRawText, false));
test("19 source loading is lazy", () => assert.deepEqual([(artifact.protectedSources as any).loading, (artifact.protectedSources as any).importTimeLoading, (artifact.protectedSources as any).preflightRawLoading], ["LAZY_AFTER_LIFECYCLE_AND_DURABLE_EXPOSURE_EVENT", false, false]));
test("20 source module has dynamic benchmark import only inside loader", () => assert.match(sourceModule, /Deliberately lazy/));
test("21 runner does not import protected fixtures", () => assert.doesNotMatch(runnerSource, /(?:import|require).{0,80}textModerationFixtures/iu));
test("22 no minimum available RAM gate", () => assert.equal((artifact.resourcePolicy as any).minimumAvailableRamBytes, null));
test("23 no minimum total RAM gate", () => assert.equal((artifact.resourcePolicy as any).minimumTotalRamBytes, null));
test("24 no fixed GB gate", () => assert.equal((artifact.resourcePolicy as any).fixedGbGate, null));
test("25 no percentage memory gate", () => assert.equal((artifact.resourcePolicy as any).percentageFreeMemoryGate, null));
test("26 RAM does not affect eligibility", () => assert.equal((artifact.resourcePolicy as any).ramAffectsEligibility, false));
test("27 runner source has no memory gate utility", () => assert.doesNotMatch(runnerSource, /virtual_memory|psutil|\bGiB\b|\bGB-class\b/iu));
test("28 allocation failures preserve lifecycle", () => assert.equal((artifact.resourcePolicy as any).actualAllocationFailureDisposition, "FAILED_WITH_LIFECYCLE_AND_EXPOSURE_PRESERVED"));
test("29 exposure order exact", () => assert.deepEqual((artifact.lifecycle as any).appendOnlyExposureEvents, ["INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"]));
test("30 completion requires both sources", () => assert.equal((artifact.lifecycle as any).completionRequiresBothSources, true));
test("31 exposure cannot be erased", () => assert.equal((artifact.lifecycle as any).priorExposureCannotBeErased, true));
test("32 output overwrite refused", () => assert.equal((artifact.lifecycle as any).overwriteRefused, true));
test("33 preparation boundaries all zero", () => assert.equal(Object.values(artifact.boundaries).every((value) => value === 0), true));
test("34 preparation validates", () => assert.doesNotThrow(() => validateMhsV2ControlledEvaluationPreparation(artifact)));
test("35 candidate tamper fails closed", () => { const bad = clone(); (bad.authorities as any).candidateSha256 = "0".repeat(64); assert.throws(() => validateMhsV2ControlledEvaluationPreparation(bad), /canonical payload/); });
test("36 resource-policy tamper fails closed", () => { const bad = clone(); (bad.resourcePolicy as any).minimumAvailableRamBytes = 1; assert.throws(() => validateMhsV2ControlledEvaluationPreparation(bad), /canonical payload|resource/); });
test("37 immutable publication refuses replay", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8d-b-")); try { publishMhsV2ControlledEvaluationPreparation(artifact, directory); assert.throws(() => publishMhsV2ControlledEvaluationPreparation(artifact, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("38 publication failure rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8d-b-")); try { assert.throws(() => publishMhsV2ControlledEvaluationPreparation(artifact, directory, () => { throw new Error("injected"); }), /injected/); assert.equal(fs.existsSync(path.join(directory, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("39 published preparation canonical and pinned", () => { const bytes = fs.readFileSync(preparationPath), parsed = JSON.parse(bytes.toString("utf8")); assert.deepEqual([sha(bytes), parsed.preparationPayloadDigest, bytes.toString("utf8")], [MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST, canonicalJson(parsed)]); });
test("40 Python synthetic unit suite passes", () => { const result = spawnSync(python, [pythonTests], { cwd: root, encoding: "utf8", timeout: 120_000 }); assert.equal(result.status, 0, result.stderr); assert.match(result.stderr, /Ran 29 tests/); });
test("41 metadata-only preflight now refuses completed output replay", () => { const result = spawnSync(python, [paths.runner, "--preflight"], { cwd: root, encoding: "utf8", timeout: 120_000 }); assert.notEqual(result.status, 0); assert.match(result.stderr, /output root already exists/); });
test("42 synthetic self-test passes with zero execution", () => { const result = spawnSync(python, [paths.runner, "--self-test"], { cwd: root, encoding: "utf8", timeout: 120_000 }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /"protectedInference": 0/); });
test("43 arbitrary CLI override rejected", () => { const result = spawnSync(python, [paths.runner, "--preflight", "--batch-size", "1"], { cwd: root, encoding: "utf8" }); assert.notEqual(result.status, 0); assert.match(result.stderr, /unrecognized arguments/); });
test("44 historical preparation is followed by immutable completed output", () => { const output = path.resolve(root, (artifact.configuration as any).outputRoot); assert.equal(fs.existsSync(output), true); assert.equal(JSON.parse(fs.readFileSync(path.join(output, "run/lifecycle.json"), "utf8")).status, "COMPLETED"); });
test("45 ready status only", () => assert.equal(artifact.status, "LOCAL_CONTROLLED_EVALUATION_READY"));
