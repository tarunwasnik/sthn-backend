import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_LOCAL_PREPARATION_FILENAME,
  MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256,
  MHS_V2_SUCCESSOR_MODEL_SHA256,
  MHS_V2_SUCCESSOR_RUNNER_SHA256,
  createMhsV2SuccessorLocalPreparation,
  defaultMhsV2SuccessorLocalPreparationPaths,
  publishMhsV2SuccessorLocalPreparation,
  validateMhsV2SuccessorLocalPreparation,
} from "../../research/textModerationDataset/mhsV2SuccessorLocalTrainingPreparation";

const root = process.cwd(), paths = defaultMhsV2SuccessorLocalPreparationPaths(root);
const training = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/training");
const artifactPath = path.join(training, MHS_V2_SUCCESSOR_LOCAL_PREPARATION_FILENAME);
const runnerSource = fs.readFileSync(paths.runner, "utf8"), modelSource = fs.readFileSync(paths.model, "utf8");
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as ReturnType<typeof createMhsV2SuccessorLocalPreparation>;
const authorities = artifact.authorities, config = artifact.configuration, category = artifact.categoryAuthority, objectives = artifact.objectives, checkpoints = artifact.checkpointing, resources = artifact.resourcePolicy;
const python = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089/.venv/Scripts/python.exe");
const pythonTests = path.resolve(root, "src/tests/textModerationDataset/test_mhs_v2_successor_local_training_preparation.py");

const checks: readonly [string, () => void][] = [
  ["01 preparation validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorLocalPreparation(artifact))],
  ["02 status ready", () => assert.equal(artifact.status, "LOCAL_SUCCESSOR_TRAINING_READY")],
  ["03 preparation SHA exact", () => assert.equal(sha(artifactPath), MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256)],
  ["04 preparation payload exact", () => assert.equal(artifact.preparationPayloadDigest, MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 strategy SHA", () => assert.equal((authorities.strategy as Record<string, unknown>).sha256, "e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e")],
  ["07 strategy payload", () => assert.equal((authorities.strategy as Record<string, unknown>).payloadDigest, "c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3")],
  ["08 contract SHA", () => assert.equal((authorities.successorTrainingContract as Record<string, unknown>).sha256, "80f8f7b65899ec4cf52dbee269dacaced0c3483cbc057daa47d07694e2dab591")],
  ["09 contract payload", () => assert.equal((authorities.successorTrainingContract as Record<string, unknown>).payloadDigest, "b3fdddf017c33b2c4af093ed62c4c4b2afc520f2fdb6953a745c9ff4f1bcd5b3")],
  ["10 TRAIN SHA", () => assert.equal((authorities.train as Record<string, unknown>).sha256, "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74")],
  ["11 VALIDATION SHA", () => assert.equal((authorities.validation as Record<string, unknown>).sha256, "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29")],
  ["12 projection SHA", () => assert.equal((authorities.developmentProjection as Record<string, unknown>).sha256, "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18")],
  ["13 runner SHA", () => assert.equal(sha(paths.runner), MHS_V2_SUCCESSOR_RUNNER_SHA256)],
  ["14 model SHA", () => assert.equal(sha(paths.model), MHS_V2_SUCCESSOR_MODEL_SHA256)],
  ["15 original base model", () => assert.equal((authorities.baseModel as Record<string, unknown>).source, "ORIGINAL_PINNED_BASE_NOT_FIRST_CANDIDATE")],
  ["16 base SHA", () => assert.equal((authorities.baseModel as Record<string, unknown>).weightSha256, "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb")],
  ["17 tokenizer SHA", () => assert.equal((authorities.tokenizer as Record<string, unknown>).sha256, "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c")],
  ["18 tokenizer binding", () => assert.equal((authorities.tokenizer as Record<string, unknown>).bindingSha256, "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654")],
  ["19 join key", () => assert.equal(category.joinKey, "exampleId")],
  ["20 raw text not join authority", () => assert.equal(category.rawTextEqualityAuthoritative, false)],
  ["21 category mapping", () => assert.deepEqual(category.category2id, { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 2, SEXUAL: 3, THREAT_OR_VIOLENCE: 4 })],
  ["22 OTHER excluded", () => assert.equal(category.otherInappropriateIncluded, false)],
  ["23 TRAIN category counts", () => assert.deepEqual(category.train, { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 })],
  ["24 VALIDATION category counts", () => assert.deepEqual(category.validation, { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 1, SEXUAL: 1, THREAT_OR_VIOLENCE: 1 })],
  ["25 auxiliary weight", () => assert.equal((objectives.auxiliary as Record<string, unknown>).weight, .25)],
  ["26 combined objective", () => assert.equal(objectives.total, "BINARY_CE_PLUS_0_25_TIMES_MASKED_AUXILIARY_CE")],
  ["27 zero eligible safe", () => assert.equal((objectives.auxiliary as Record<string, unknown>).zeroEligibleBatch, "DIFFERENTIABLE_ZERO_NO_EMPTY_CROSS_ENTROPY")],
  ["28 natural sampling", () => assert.equal(config.sampling, "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT")],
  ["29 batch", () => assert.deepEqual([config.trainBatchSize, config.validationBatchSize, config.gradientAccumulation, config.effectiveBatchSize], [8, 8, 1, 8])],
  ["30 optimization", () => assert.deepEqual([config.learningRate, config.epochs, config.optimizerSteps, config.warmupSteps, config.maxGradientNorm], [2e-5, 3, 75, 2, 1])],
  ["31 seed", () => assert.deepEqual([config.seedString, config.seedInteger], ["STHN_T6L_8E_B_MHS_V2_SUCCESSOR_CATEGORY_AWARE_TRAINING_RUN_V1", 926509953])],
  ["32 max length", () => assert.equal(config.maxLength, 160)],
  ["33 checkpoints", () => assert.deepEqual([checkpoints.planned, checkpoints.maximumRetained, checkpoints.format], [3, 2, "SAFETENSORS"])],
  ["34 binary selection", () => assert.deepEqual(checkpoints.selection, ["HIGHEST_VALIDATION_BINARY_MACRO_F1", "LOWEST_VALIDATION_BINARY_LOSS", "EARLIEST_EPOCH"])],
  ["35 auxiliary ignored in selection", () => assert.equal(checkpoints.auxiliaryMetricsSelectionAuthority, false)],
  ["36 CPU", () => assert.equal(resources.device, "CPU_REQUIRED")],
  ["37 GPU unauthorized", () => assert.equal(resources.gpuAuthorized, false)],
  ["38 no minimum available RAM", () => assert.equal(resources.minimumAvailableRamBytes, null)],
  ["39 no minimum total RAM", () => assert.equal(resources.minimumTotalRamBytes, null)],
  ["40 RAM non-authoritative", () => assert.equal(resources.ramAffectsEligibility, false)],
  ["41 no GB gate source", () => assert.doesNotMatch(runnerSource, /\b(?:GiB|GB-class)\b/u)],
  ["42 CPU runtime guard", () => assert.match(runnerSource, /GPU execution is prohibited/u)],
  ["43 offline tokenizer", () => assert.match(runnerSource, /AutoTokenizer\.from_pretrained\(cache, local_files_only=True/u)],
  ["44 offline model", () => assert.match(runnerSource, /Model\.from_pretrained\(cache, config=config, local_files_only=True/u)],
  ["45 standard classification head", () => assert.match(modelSource, /XLMRobertaClassificationHead/u)],
  ["46 deterministic head reset", () => assert.match(modelSource, /reset_task_heads/u)],
  ["47 zero mask implementation", () => assert.match(modelSource, /auxiliary_logits\.sum\(\) \* 0\.0/u)],
  ["48 custom columns retained", () => assert.match(runnerSource, /remove_unused_columns=False/u)],
  ["49 output root absent", () => assert.equal(fs.existsSync(paths.outputRoot), false)],
  ["50 output overwrite refused", () => assert.match(runnerSource, /overwrite and resume are prohibited/u)],
  ["51 no generic override", () => assert.doesNotMatch(runnerSource, /add_argument\(["']--(?:train|validation|dataset|model|revision|epochs|learning-rate|batch|output)/u)],
  ["52 lifecycle states", () => assert.deepEqual(artifact.lifecycle.states, ["RUNNING", "COMPLETED", "FAILED", "INTERRUPTED"])],
  ["53 threshold not selected", () => assert.equal(config.productionThresholdStatus, "NOT_SELECTED")],
  ["54 preparation counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
  ["55 training command frozen", () => assert.equal((artifact.implementation as Record<string, unknown>).futureUserCommand, "npm run train:text-moderation:mhs-v2-successor-local")],
];
for (const [name, check] of checks) test(name, check);

test("56 deterministic creation equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorLocalPreparation(paths, { preflightPassed: true, selfTestPassed: true, pythonTestsPassed: true })), fs.readFileSync(artifactPath, "utf8")));
test("57 publication overwrite refused", () => assert.throws(() => publishMhsV2SuccessorLocalPreparation(artifact, training), /overwrite refused/u));
test("58 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8e-c-")); try { assert.throws(() => publishMhsV2SuccessorLocalPreparation(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_LOCAL_PREPARATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("59 Python syntax", () => { const result = spawnSync(python, ["-m", "py_compile", paths.runner, paths.model], { cwd: root, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); });
test("60 Python synthetic suite", () => { const result = spawnSync(python, ["-m", "unittest", pythonTests, "-q"], { cwd: root, encoding: "utf8", timeout: 180_000 }); assert.equal(result.status, 0, result.stderr); assert.match(result.stderr, /Ran 17 tests/u); });
test("61 self-test has zero real execution", () => { const result = spawnSync(python, [paths.runner, "--self-test"], { cwd: root, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /"modelLoads": 0/u); assert.match(result.stdout, /"trainingRuns": 0/u); });
test("62 preflight has zero real execution", () => { const result = spawnSync(python, [paths.runner, "--preflight"], { cwd: root, encoding: "utf8", timeout: 120_000 }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /AUTHORITY_PREFLIGHT_PASSED/u); assert.match(result.stdout, /"modelLoads": 0/u); assert.equal(fs.existsSync(paths.outputRoot), false); });
test("63 arbitrary override rejected", () => { const result = spawnSync(python, [paths.runner, "--preflight", "--epochs", "9"], { cwd: root, encoding: "utf8" }); assert.notEqual(result.status, 0); assert.match(result.stderr, /unrecognized arguments/u); });
