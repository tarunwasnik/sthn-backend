import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  createMhsV2FirstLocalTrainingCertification,
  defaultMhsV2FirstLocalCertificationPaths,
  MHS_V2_FIRST_LOCAL_EPOCH_02_MODEL_SHA256,
  MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256,
  MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256,
  MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_FILENAME,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256,
  MHS_V2_FIRST_LOCAL_VALIDATION_WARNING,
  MhsV2FirstLocalTrainingCertificationArtifact,
  publishMhsV2FirstLocalTrainingCertification,
  sha256FileStreaming,
  validateMhsV2FirstLocalTrainingCertification,
} from "../../research/textModerationDataset/mhsV2FirstLocalTrainingCertification";

const root = process.cwd(), paths = defaultMhsV2FirstLocalCertificationPaths(root), artifact = createMhsV2FirstLocalTrainingCertification(paths);
const certificationPath = path.join(path.dirname(paths.contract), MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_FILENAME);
const clone = (): MhsV2FirstLocalTrainingCertificationArtifact => structuredClone(artifact);
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");

test("01 all required frozen authorities validate", () => assert.doesNotThrow(() => validateMhsV2FirstLocalTrainingCertification(artifact)));
test("02 generated run and lifecycle are completed", () => assert.deepEqual([artifact.run.lifecycleStatus, artifact.run.resultStatus], ["COMPLETED", "FIRST_TRAINING_RUN_COMPLETED"]));
test("03 TRAIN identity and count are exact", () => assert.deepEqual(artifact.inputs.TRAIN, { rows: 200, ALLOW: 110, BLOCK: 90, sha256: "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74", payloadDigest: "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff", membershipDigest: "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61" }));
test("04 VALIDATION identity and count are exact", () => assert.deepEqual(artifact.inputs.VALIDATION, { rows: 13, ALLOW: 9, BLOCK: 4, sha256: "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29", payloadDigest: "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095", membershipDigest: "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164" }));
test("05 execution completed three epochs and 75 optimizer steps", () => assert.deepEqual([artifact.execution.epochsCompleted, artifact.execution.optimizerSteps, artifact.execution.schedulerSteps], [3, 75, 75]));
test("06 exactly three validation evaluations are certified", () => assert.equal(artifact.execution.validationEvaluations, 3));
test("07 protected and unauthorized population counters are zero", () => assert.deepEqual([artifact.isolation.internalTestRawAccesses, artifact.isolation.benchmarkRawAccesses, artifact.isolation.reserveUses, artifact.isolation.exclusionUses], [0, 0, 0, 0]));
test("08 production threshold remains unselected", () => assert.equal(artifact.disposition.thresholdSelected, false));
test("09 epoch 3 is independently selected", () => assert.deepEqual([artifact.checkpoints.independentlySelectedEpoch, artifact.checkpoints.selectedPath], [3, "checkpoints/checkpoint-epoch-03"]));
test("10 epoch 3 wins the frozen primary selection criterion", () => assert.deepEqual(artifact.epochMetrics.map((row) => row.macroF1), [0.40909090909090906, 0.7067669172932332, 0.7833333333333333]));
test("11 retained checkpoint policy is exact", () => assert.deepEqual([artifact.checkpoints.conceptualCount, artifact.checkpoints.retainedCount, artifact.checkpoints.maximumRetained, artifact.checkpoints.retained.map((item) => item.epoch)], [3, 2, 2, [2, 3]]));
test("12 epoch 2 actual model hash is verified", () => assert.equal(artifact.checkpoints.retained[0].modelSha256, MHS_V2_FIRST_LOCAL_EPOCH_02_MODEL_SHA256));
test("13 selected checkpoint actual model hash is verified", () => assert.equal(artifact.checkpoints.selectedCheckpointModelSha256, MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256));
test("14 final export equals the selected checkpoint model", () => assert.deepEqual([artifact.checkpoints.finalModelSha256, artifact.checkpoints.finalModelMatchesSelectedCheckpoint], [MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, true]));
test("15 run-manifest actual file hash is verified", () => assert.deepEqual([sha256FileStreaming(paths.runManifest), artifact.run.runManifestSha256], [MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256]));
test("16 result-summary actual file hash is verified", () => assert.deepEqual([sha256FileStreaming(paths.resultSummary), artifact.run.resultSummarySha256], [MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256, MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256]));
test("17 frozen CPU environment is preserved", () => assert.deepEqual([artifact.execution.device, artifact.execution.cudaAvailable, artifact.execution.environment.pytorch, artifact.execution.environment.transformers], ["CPU", false, "2.3.1+cpu", "4.42.4"]));
test("18 deterministic seed authority is preserved", () => assert.deepEqual([artifact.execution.seedString, artifact.execution.seedInteger], ["STHN_T6L_8B_MHS_V2_FIRST_TRAINING_RUN_V1", 1538422894]));
test("19 validation warning and recall caveat are preserved", () => assert.deepEqual([artifact.validationCaveat.warning, artifact.validationCaveat.rows, artifact.validationCaveat.epoch3BlockRecall], [MHS_V2_FIRST_LOCAL_VALIDATION_WARNING, 13, 0.5]));
test("20 certification performs no protected evaluation", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2FirstLocalTrainingCertification.ts"), "utf8"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|AutoModel|from_pretrained|trainer\.evaluate/iu); assert.deepEqual([artifact.isolation.certificationProtectedPayloadReads, artifact.isolation.certificationClassifierEvaluations], [0, 0]); });
test("21 mismatched authority fails closed", () => { const bad = clone(); (bad.authorities as Record<string, string>).trainingContractSha256 = "0".repeat(64); assert.throws(() => validateMhsV2FirstLocalTrainingCertification(bad), /canonical payload/); });
test("22 mismatched completed status fails closed", () => { const bad = clone() as unknown as { status: string }; bad.status = "FAILED"; assert.throws(() => validateMhsV2FirstLocalTrainingCertification(bad as unknown as MhsV2FirstLocalTrainingCertificationArtifact), /identity/); });
test("23 mismatched selected model hash fails closed", () => { const bad = clone(); (bad.checkpoints as { selectedCheckpointModelSha256: string }).selectedCheckpointModelSha256 = "0".repeat(64); assert.throws(() => validateMhsV2FirstLocalTrainingCertification(bad), /canonical payload|checkpoint/); });
test("24 wrong epoch selection fails closed", () => { const bad = clone(); (bad.checkpoints as { independentlySelectedEpoch: number }).independentlySelectedEpoch = 2; assert.throws(() => validateMhsV2FirstLocalTrainingCertification(bad), /canonical payload|checkpoint/); });
test("25 publication is immutable and replay is refused", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8c3-")); try { publishMhsV2FirstLocalTrainingCertification(artifact, directory); assert.throws(() => publishMhsV2FirstLocalTrainingCertification(artifact, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("26 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8c3-")); try { assert.throws(() => publishMhsV2FirstLocalTrainingCertification(artifact, directory, () => { throw new Error("injected"); }), /injected/); assert.equal(fs.existsSync(path.join(directory, MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("27 published certification is canonical and pinned", () => { const bytes = fs.readFileSync(certificationPath), published = JSON.parse(bytes.toString("utf8")) as MhsV2FirstLocalTrainingCertificationArtifact; assert.doesNotThrow(() => validateMhsV2FirstLocalTrainingCertification(published)); assert.deepEqual([sha(bytes), published.certificationPayloadDigest, bytes.toString("utf8")], [MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256, MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST, canonicalJson(published)]); });
test("28 final disposition is bounded and non-production", () => assert.deepEqual(artifact.disposition, { executionIntegrityCertified: true, eligibleForNextControlledEvaluationStage: true, productionReady: false, thresholdSelected: false, internalTestValidated: false, externalBenchmarkValidated: false, modelAdequacyCertified: false, exactNextAction: "STOP_AFTER_T6L_8C3_AWAIT_SEPARATE_CONTROLLED_EVALUATION_AUTHORIZATION" }));
