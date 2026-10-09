import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  createMhsV2ControlledEvaluationContract,
  defaultMhsV2ControlledEvaluationContractPaths,
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_FILENAME,
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256,
  MhsV2ControlledEvaluationContractArtifact,
  publishMhsV2ControlledEvaluationContract,
  validateMhsV2ControlledEvaluationContract,
} from "../../research/textModerationDataset/mhsV2ControlledEvaluationContract";

const root = process.cwd(), paths = defaultMhsV2ControlledEvaluationContractPaths(root);
const artifact = createMhsV2ControlledEvaluationContract(paths), clone = (): MhsV2ControlledEvaluationContractArtifact => structuredClone(artifact);
const publishedPath = path.join(path.dirname(paths.certification), MHS_V2_CONTROLLED_EVALUATION_CONTRACT_FILENAME);
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");

test("01 exact candidate authority is frozen", () => assert.equal(artifact.candidate.finalModelSha256, "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79"));
test("02 8C3 certification is bound", () => assert.deepEqual(artifact.authorities.trainingCertification, { sha256: "43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a", payloadDigest: "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47" }));
test("03 run manifest and summary are bound", () => assert.deepEqual([(artifact.authorities.runManifest as any).sha256, (artifact.authorities.resultSummary as any).sha256], ["b0465888ae65fa085c5b05b330f4241b0c0bf8f8f99562da9e2a4c88fb136e56", "45c4b9ca6b5f20be06ee6b9468c107156ca4284fe3c75592b12ae9768404b805"]));
test("03a tokenizer authority is transitively bound by the immutable tokenizer-binding artifact", () => { const binding = JSON.parse(fs.readFileSync(paths.tokenizerBinding, "utf8")); assert.deepEqual([artifact.candidate.tokenizerBindingSha256, binding.tokenizerArtifactSha256], ["14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654", "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c"]); });
test("04 INTERNAL_TEST authority and count are exact", () => assert.deepEqual(artifact.authorities.internalTest, { version: "MHS_INTERNAL_TEST_FREEZE_V1", sha256: "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", payloadDigest: "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb", membershipDigest: "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13", count: 13, decisionCounts: { ALLOW: 9, BLOCK: 4 } }));
test("05 benchmark authority and count are exact", () => assert.deepEqual(artifact.authorities.externalBenchmark, { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747", count: 140 }));
test("06 reserve and exclusions are prohibited", () => assert.deepEqual(artifact.authorities.prohibitedPopulations, { reserveCount: 256, exclusionCount: 4, authorizedForEvaluation: false }));
test("07 preprocessing is inherited exactly", () => assert.deepEqual([artifact.preprocessing.maxLength, artifact.preprocessing.truncation, artifact.preprocessing.padding, artifact.preprocessing.exactUnicode], [160, "RIGHT", "DYNAMIC_LONGEST_IN_BATCH", true]));
test("08 execution is deterministic CPU FP32 evaluation", () => assert.deepEqual([artifact.execution.device, artifact.execution.precision, artifact.execution.batchSize, artifact.execution.evaluationMode, artifact.execution.gradientTracking, artifact.execution.shuffle], ["CPU", "FP32", 8, true, false, false]));
test("08a label mapping is ALLOW zero and BLOCK one", () => assert.deepEqual(artifact.candidate.labels, { "0": "ALLOW", "1": "BLOCK" }));
test("09 stage order is frozen", () => assert.deepEqual(artifact.stages.map((row) => row.id), ["CANDIDATE_INTEGRITY_PREFLIGHT", "INTERNAL_TEST_EVALUATION", "EXTERNAL_BENCHMARK_EVALUATION", "COMBINED_ANALYSIS", "LATER_DECISION"]));
test("10 sources cannot tune one another", () => assert.deepEqual([(artifact.stages[2] as any).priorSourceOutcomesMayAlterExecution, artifact.interpretation.noTuningBetweenSources], [false, true]));
test("11 argmax and tie behavior are exact", () => assert.deepEqual([artifact.decisionAndScores.rule, artifact.decisionAndScores.tieRule], ["ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", "LOWEST_LABEL_INDEX_ALLOW"]));
test("12 production threshold remains unselected", () => assert.equal(artifact.decisionAndScores.productionThresholdStatus, "NOT_SELECTED"));
test("13 scores are diagnostic and not calibrated confidence", () => assert.deepEqual((artifact.decisionAndScores.scores as any), { computation: "DETERMINISTIC_SOFTMAX_OF_TWO_LOGITS", names: ["ALLOW_SCORE", "BLOCK_SCORE"], calibratedConfidence: false, termConfidenceProhibited: true }));
test("14 per-example output excludes raw text", () => assert.deepEqual([artifact.perExampleOutput.rawTextIncluded, (artifact.perExampleOutput.requiredFields as string[]).includes("text"), (artifact.perExampleOutput.forbiddenFields as string[]).includes("text")], [false, false, true]));
test("15 required independent metrics are complete", () => assert.deepEqual(artifact.metrics.computedIndependentlyFor, ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"]));
test("16 combined analysis does not pool authority", () => assert.deepEqual(artifact.metrics.combinedAnalysis, { preserveIndependentMetrics: true, pooledQualityMetricProhibited: true, sourceWeightingProhibited: true }));
test("17 small sample warning and no quality threshold are explicit", () => assert.deepEqual([artifact.interpretation.internalTestWarning, artifact.interpretation.qualityPassFailThresholdDefined], ["INTERNAL_TEST_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE_NO_PASS_FAIL_QUALITY_THRESHOLD", false]));
test("18 output root is immutable", () => assert.deepEqual([artifact.output.overwritePolicy, artifact.output.partialPublicationPolicy], ["REFUSE_IF_ROOT_EXISTS", "FAILED_OR_INTERRUPTED_RUN_NEVER_AUTHORITATIVE"]));
test("19 failures are fail closed", () => assert.deepEqual([artifact.failurePolicy.partialMetricsAreAuthoritative, artifact.failurePolicy.automaticRepair], [false, false]));
test("20 phase separation is one way", () => assert.deepEqual(artifact.lifecycle.nextPhases, ["T6L-8D-B_RUNNER_PREPARATION", "T6L-8D-C_USER_LOCAL_EXECUTION", "T6L-8D-D_RESULT_CERTIFICATION", "T6L-8E_SEPARATELY_AUTHORIZED_DECISION_PHASE"]));
test("21 design phase performs no evaluation or protected reads", () => assert.deepEqual([artifact.boundaries.modelLoads, artifact.boundaries.classifierEvaluations, artifact.boundaries.protectedRawTextReads, artifact.boundaries.runnerCreated, artifact.boundaries.resultsCreated], [0, 0, 0, false, false]));
test("22 contract validates", () => assert.doesNotThrow(() => validateMhsV2ControlledEvaluationContract(artifact)));
test("23 candidate mismatch fails closed", () => { const bad = clone(); (bad.candidate as Record<string, unknown>).finalModelSha256 = "0".repeat(64); assert.throws(() => validateMhsV2ControlledEvaluationContract(bad), /canonical payload|candidate/); });
test("24 threshold mutation fails closed", () => { const bad = clone(); (bad.decisionAndScores as Record<string, unknown>).productionThresholdStatus = "0.5"; assert.throws(() => validateMhsV2ControlledEvaluationContract(bad), /canonical payload|decision/); });
test("25 source-order mutation fails closed", () => { const bad = clone(); (bad.stages as any)[1].id = "EXTERNAL_BENCHMARK_EVALUATION"; assert.throws(() => validateMhsV2ControlledEvaluationContract(bad), /canonical payload|stage/); });
test("25a protected-source authority mutation fails closed", () => { const bad = clone(); (bad.authorities.internalTest as Record<string, unknown>).sha256 = "0".repeat(64); assert.throws(() => validateMhsV2ControlledEvaluationContract(bad), /canonical payload/); });
test("26 immutable publication refuses replay", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8d-a-")); try { publishMhsV2ControlledEvaluationContract(artifact, directory); assert.throws(() => publishMhsV2ControlledEvaluationContract(artifact, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("27 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8d-a-")); try { assert.throws(() => publishMhsV2ControlledEvaluationContract(artifact, directory, () => { throw new Error("injected"); }), /injected/); assert.equal(fs.existsSync(path.join(directory, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("28 published contract is canonical and pinned", () => { const bytes = fs.readFileSync(publishedPath), published = JSON.parse(bytes.toString("utf8")); assert.deepEqual([sha(bytes), published.contractPayloadDigest, bytes.toString("utf8")], [MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST, canonicalJson(published)]); });
test("29 source has no protected raw loader or inference dependency", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2ControlledEvaluationContract.ts"), "utf8"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|AutoModel|from_pretrained|torch\.|model\(/u); });
test("30 status and next action stop before runner preparation", () => assert.deepEqual([artifact.status, artifact.lifecycle.exactNextAction], ["CONTROLLED_EVALUATION_CONTRACT_READY", "STOP_AFTER_T6L_8D_A_AWAIT_T6L_8D_B_AUTHORIZATION"]));
