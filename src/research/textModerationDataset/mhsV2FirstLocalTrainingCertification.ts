import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_TRAINING_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_TRAINING_CONTRACT_SHA256,
  MHS_V2_TRAINING_ENVIRONMENT_PAYLOAD_DIGEST,
  MHS_V2_TRAINING_ENVIRONMENT_SHA256,
  MHS_V2_TRAINING_MASTER_SEED,
  MHS_V2_TRAINING_MASTER_SEED_STRING,
  MHS_V2_TRAINING_OUTPUT_ROOT,
  MHS_V2_TRAINING_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_TRAINING_PREPARATION_SHA256,
} from "./mhsV2TrainingContract";
import {
  MHS_V2_MATERIALIZATION_PAYLOAD_DIGEST,
  MHS_V2_MATERIALIZATION_SHA256,
  MHS_V2_TRAINING_READY_PAYLOAD_DIGEST,
  MHS_V2_TRAINING_READY_SHA256,
  MHS_V2_TRAIN_PAYLOAD_DIGEST,
  MHS_V2_TRAIN_SHA256,
  MHS_V2_VALIDATION_PAYLOAD_DIGEST,
  MHS_V2_VALIDATION_SHA256,
} from "./mhsTrainingReadyDataset";

export const MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_FIRST_LOCAL_TRAINING_RUN_CERTIFICATION_V1" as const;
export const MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_VERSION = "MHS_V2_FIRST_LOCAL_TRAINING_RUN_CERTIFICATION_V1" as const;
export const MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_FILENAME = "mhs-v2-first-local-training-run-certification-v1.json" as const;
export const MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256 = "43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a";
export const MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST = "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47";
export const MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256 = "b0465888ae65fa085c5b05b330f4241b0c0bf8f8f99562da9e2a4c88fb136e56" as const;
export const MHS_V2_FIRST_LOCAL_RUN_MANIFEST_PAYLOAD_DIGEST = "defa433e83bd88215061ec593684b4d5d62c34b4693c9cee0d56d8fa0805d294" as const;
export const MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256 = "45c4b9ca6b5f20be06ee6b9468c107156ca4284fe3c75592b12ae9768404b805" as const;
export const MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256 = "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79" as const;
export const MHS_V2_FIRST_LOCAL_EPOCH_02_MODEL_SHA256 = "2cd1a61d9aaad609245c006a6695fadf212e505fe1e2ec7a25c493c2f2508433" as const;
export const MHS_V2_FIRST_LOCAL_VALIDATION_WARNING = "VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE" as const;

const RELEASE_SHA = "a001c63cf1d4674d9dcad89c9e630348ce3e1461a6e8cd12971b813724e65ec7";
const RELEASE_PAYLOAD = "1575c609b85dcbfdd164099ce7fb13901226d60a261958ea8aa16cf8d5c8e9a4";
const ELIGIBILITY_SHA = "1201be0665a82b03ab9e056e8bad16737afaf8cf6159602fde3ecf8cf00d7649";
const ELIGIBILITY_PAYLOAD = "05b9d74d3b2ae0c8166d50eb5ee79000ba51341a7d8356ddda43a3fc627b1588";
const FINAL_ASSIGNMENT_SHA = "1a574fdbd1b832728dc9ac879c8d914775a10304f31d47b622fcb89c78d8ad32";
const FINAL_ASSIGNMENT_PAYLOAD = "036b1db3386c95f4e6f167cc5065197302fcc505c6464ba92a568739ab79f433";
const FINAL_ASSIGNMENT_DIGEST = "f9ca44ba63979d998f85ef83d7aad88de5fd743ccb2d1da71572d76fe8322cec";
const HISTORICAL_SPLIT_SHA = "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f";
const INTERNAL_TEST_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const CANDIDATE_SHA = "972dd6b681fe953e10cc66eeb5dd15091bed86b60df19171a46cf31d45a463d0";
const UNIVERSE_SHA = "ca7e922cac23416e9da64c9a0ceefa52d40df7246f286f940bd1c13fd135095a";
const UNIVERSE_PAYLOAD = "c33fad78823c66f4b10d80534ee3a2433447dcd829efc76b4affa7e379350638";
const UNIVERSE_MEMBERSHIP = "d7e9b98aa9ebc971b0e3c036f0da1608e1f352a798335e550be1aaf7079c724e";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const TRAIN_MEMBERSHIP = "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61";
const VALIDATION_MEMBERSHIP = "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164";
const MODEL_REVISION = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089";
const BASE_MODEL_SHA = "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";

type JsonRecord = Record<string, unknown>;
export interface MhsV2FirstLocalCertificationPaths {
  readonly release: string; readonly eligibility: string; readonly finalAssignmentCertification: string;
  readonly historicalSplit: string; readonly internalTestFreeze: string; readonly developmentProjection: string;
  readonly projectionManifest: string; readonly materializationManifest: string; readonly trainingReady: string;
  readonly train: string; readonly validation: string; readonly preparation: string; readonly environment: string;
  readonly contract: string; readonly runner: string; readonly runManifest: string; readonly resultSummary: string;
  readonly lifecycle: string; readonly checkpointEpoch02Model: string; readonly checkpointEpoch03Model: string;
  readonly finalModel: string; readonly finalConfig: string; readonly tokenizerBinding: string;
}

export interface EpochMetrics {
  readonly epoch: number; readonly globalStep: number; readonly trainingLoss: number; readonly validationLoss: number;
  readonly confusionMatrix: readonly (readonly number[])[]; readonly accuracy: number; readonly blockPrecision: number;
  readonly blockRecall: number; readonly blockF1: number; readonly macroF1: number; readonly balancedAccuracy: number;
}

export interface MhsV2FirstLocalTrainingCertificationPayload {
  readonly schemaVersion: typeof MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SCHEMA;
  readonly certificationVersion: typeof MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_VERSION;
  readonly phase: "T6L-8C3"; readonly status: "FIRST_TRAINING_RUN_CERTIFIED";
  readonly authorities: Readonly<Record<string, string>>;
  readonly run: { readonly runId: string; readonly outputRoot: string; readonly runManifestPath: string; readonly runManifestSha256: string; readonly runManifestPayloadDigest: string; readonly resultSummaryPath: string; readonly resultSummarySha256: string; readonly lifecyclePath: string; readonly lifecycleStatus: "COMPLETED"; readonly resultStatus: "FIRST_TRAINING_RUN_COMPLETED"; readonly startedAt: string; readonly endedAt: string; readonly elapsedSeconds: number };
  readonly inputs: { readonly TRAIN: { readonly rows: 200; readonly ALLOW: 110; readonly BLOCK: 90; readonly sha256: string; readonly payloadDigest: string; readonly membershipDigest: string }; readonly VALIDATION: { readonly rows: 13; readonly ALLOW: 9; readonly BLOCK: 4; readonly sha256: string; readonly payloadDigest: string; readonly membershipDigest: string } };
  readonly execution: { readonly device: "CPU"; readonly cudaAvailable: false; readonly epochsCompleted: 3; readonly optimizerSteps: 75; readonly schedulerSteps: 75; readonly validationEvaluations: 3; readonly seedString: string; readonly seedInteger: number; readonly environment: Readonly<Record<string, string>>; readonly configuration: JsonRecord };
  readonly epochMetrics: readonly EpochMetrics[];
  readonly checkpoints: { readonly conceptualCount: 3; readonly retainedCount: 2; readonly maximumRetained: 2; readonly retained: readonly { readonly epoch: number; readonly path: string; readonly modelSha256: string }[]; readonly selectionRule: readonly string[]; readonly independentlySelectedEpoch: 3; readonly selectedPath: "checkpoints/checkpoint-epoch-03"; readonly selectedCheckpointModelSha256: string; readonly finalModelSha256: string; readonly finalModelMatchesSelectedCheckpoint: true };
  readonly isolation: { readonly internalTestRawAccesses: 0; readonly benchmarkRawAccesses: 0; readonly reserveUses: 0; readonly exclusionUses: 0; readonly onlyAuthorizedTrainValidationUsed: true; readonly certificationProtectedPayloadReads: 0; readonly certificationClassifierEvaluations: 0 };
  readonly validationCaveat: { readonly warning: typeof MHS_V2_FIRST_LOCAL_VALIDATION_WARNING; readonly rows: 13; readonly ALLOW: 9; readonly BLOCK: 4; readonly preliminaryDevelopmentEvidence: true; readonly highSamplingVariance: true; readonly epoch3BlockRecall: 0.5 };
  readonly certificationChecks: Readonly<Record<string, true>>;
  readonly disposition: { readonly executionIntegrityCertified: true; readonly eligibleForNextControlledEvaluationStage: true; readonly productionReady: false; readonly thresholdSelected: false; readonly internalTestValidated: false; readonly externalBenchmarkValidated: false; readonly modelAdequacyCertified: false; readonly exactNextAction: "STOP_AFTER_T6L_8C3_AWAIT_SEPARATE_CONTROLLED_EVALUATION_AUTHORIZATION" };
  readonly certifiedAt: string;
}
export type MhsV2FirstLocalTrainingCertificationArtifact = MhsV2FirstLocalTrainingCertificationPayload & { readonly certificationPayloadDigest: string };

const record = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`T6L-8C3 invalid ${label}`);
  return value as JsonRecord;
};
const number = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`T6L-8C3 invalid ${label}`);
  return value;
};
const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`T6L-8C3 invalid ${label}`);
  return value;
};
const exact = (actual: unknown, expected: unknown, label: string): void => {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8C3 ${label} mismatch`);
};
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
export const sha256FileStreaming = (filename: string): string => {
  const hash = crypto.createHash("sha256"), descriptor = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try { let bytesRead = 0; do { bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead)); } while (bytesRead > 0); }
  finally { fs.closeSync(descriptor); }
  return hash.digest("hex");
};
const readJson = (filename: string): JsonRecord => record(JSON.parse(fs.readFileSync(filename, "utf8")), path.basename(filename));
const assertSha = (filename: string, expected: string, label: string): void => { if (sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8C3 ${label} SHA-256 mismatch`); };
const sortEpochs = (epochs: readonly EpochMetrics[]): readonly EpochMetrics[] => [...epochs].sort((left, right) => right.macroF1 - left.macroF1 || left.validationLoss - right.validationLoss || left.epoch - right.epoch);

export const defaultMhsV2FirstLocalCertificationPaths = (root = process.cwd()): MhsV2FirstLocalCertificationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), output = path.resolve(root, MHS_V2_TRAINING_OUTPUT_ROOT);
  return {
    release: path.join(mhs, "release/mhs-release-manifest-v2.json"), eligibility: path.join(mhs, "release/mhs-training-eligibility-manifest-v2.json"),
    finalAssignmentCertification: path.join(mhs, "expansion/final-assignment/mhs-v2-final-leakage-safe-assignment-certification-v1.json"),
    historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
    developmentProjection: path.join(mhs, "development/mhs-development-text-projection-v2.jsonl"), projectionManifest: path.join(mhs, "development/mhs-development-text-projection-manifest-v2.json"),
    materializationManifest: path.join(mhs, "materialized/mhs-materialization-manifest-v2.json"), trainingReady: path.join(mhs, "materialized/mhs-training-ready-certification-v2.json"),
    train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"),
    preparation: path.join(mhs, "training/mhs-v2-training-preparation-analysis-v1.json"), environment: path.join(mhs, "training/mhs-v2-training-environment-authority-v1.json"), contract: path.join(mhs, "training/mhs-v2-xlm-roberta-training-contract-v1.json"),
    runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_local_training.py"), runManifest: path.join(output, "run/run-manifest.json"), resultSummary: path.join(output, "run/result-summary.json"), lifecycle: path.join(output, "run/lifecycle.json"),
    checkpointEpoch02Model: path.join(output, "checkpoints/checkpoint-epoch-02/model.safetensors"), checkpointEpoch03Model: path.join(output, "checkpoints/checkpoint-epoch-03/model.safetensors"), finalModel: path.join(output, "final/model.safetensors"), finalConfig: path.join(output, "final/config.json"), tokenizerBinding: path.join(output, "final/tokenizer-binding.json"),
  };
};

const epochMetrics = (value: unknown): readonly EpochMetrics[] => {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("T6L-8C3 epoch metric count mismatch");
  return value.map((item, index) => {
    const row = record(item, `epoch ${index + 1}`), confusion = row.confusionMatrix;
    if (!Array.isArray(confusion) || confusion.length !== 2 || confusion.some((entry) => !Array.isArray(entry) || entry.length !== 2)) throw new Error("T6L-8C3 confusion matrix mismatch");
    return { epoch: number(row.epoch, "epoch"), globalStep: number(row.globalStep, "global step"), trainingLoss: number(row.trainingLoss, "training loss"), validationLoss: number(row.validationLoss, "validation loss"), confusionMatrix: confusion as readonly (readonly number[])[], accuracy: number(row.accuracy, "accuracy"), blockPrecision: number(row.blockPrecision, "BLOCK precision"), blockRecall: number(row.blockRecall, "BLOCK recall"), blockF1: number(row.blockF1, "BLOCK F1"), macroF1: number(row.macroF1, "macro F1"), balancedAccuracy: number(row.balancedAccuracy, "balanced accuracy") };
  });
};

export const createMhsV2FirstLocalTrainingCertification = (paths: MhsV2FirstLocalCertificationPaths): MhsV2FirstLocalTrainingCertificationArtifact => {
  const upstream: readonly [string, string, string][] = [
    [paths.release, RELEASE_SHA, "release"], [paths.eligibility, ELIGIBILITY_SHA, "eligibility"], [paths.finalAssignmentCertification, FINAL_ASSIGNMENT_SHA, "final assignment"],
    [paths.historicalSplit, HISTORICAL_SPLIT_SHA, "historical split"], [paths.internalTestFreeze, INTERNAL_TEST_FREEZE_SHA, "INTERNAL_TEST freeze metadata"],
    [paths.developmentProjection, "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18", "development projection"], [paths.projectionManifest, "6886efd351c6422412c9809ae5af39e8f3bc4404b75d106aa34af5110d21f21a", "projection manifest"],
    [paths.materializationManifest, MHS_V2_MATERIALIZATION_SHA256, "materialization"], [paths.trainingReady, MHS_V2_TRAINING_READY_SHA256, "training-ready"], [paths.train, MHS_V2_TRAIN_SHA256, "TRAIN"], [paths.validation, MHS_V2_VALIDATION_SHA256, "VALIDATION"],
    [paths.preparation, MHS_V2_TRAINING_PREPARATION_SHA256, "preparation"], [paths.environment, MHS_V2_TRAINING_ENVIRONMENT_SHA256, "environment"], [paths.contract, MHS_V2_TRAINING_CONTRACT_SHA256, "training contract"],
  ];
  upstream.forEach(([filename, expected, label]) => assertSha(filename, expected, label));
  const release = readJson(paths.release), eligibility = readJson(paths.eligibility), assignment = readJson(paths.finalAssignmentCertification), manifest = readJson(paths.runManifest), summary = readJson(paths.resultSummary), lifecycle = readJson(paths.lifecycle);
  const releaseAuthorities = record(release.authorities, "release authorities"), membership = record(release.membershipDigests, "release membership"), sealed = record(eligibility.sealedEvaluation, "sealed evaluation"), benchmark = record(sealed.externalBenchmark, "sealed benchmark");
  exact([release.releasePayloadDigest, eligibility.eligibilityPayloadDigest, assignment.certificationPayloadDigest, assignment.assignmentMembershipDigest], [RELEASE_PAYLOAD, ELIGIBILITY_PAYLOAD, FINAL_ASSIGNMENT_PAYLOAD, FINAL_ASSIGNMENT_DIGEST], "upstream payload authorities");
  exact([releaseAuthorities.v2CandidateSha256, releaseAuthorities.v2UniverseSha256, releaseAuthorities.historicalSplitSha256, releaseAuthorities.internalTestFreezeSha256, releaseAuthorities.kdCertificationSha256], [CANDIDATE_SHA, UNIVERSE_SHA, HISTORICAL_SPLIT_SHA, INTERNAL_TEST_FREEZE_SHA, FINAL_ASSIGNMENT_SHA], "release lineage");
  exact([membership.train, membership.validation, benchmark.version, benchmark.sha256, benchmark.rawContentIncluded], [TRAIN_MEMBERSHIP, VALIDATION_MEMBERSHIP, "STHN_TEXT_MODERATION_FIXTURES_V1R", BENCHMARK_SHA, false], "sealed population metadata");
  assertSha(paths.runManifest, MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, "run manifest"); assertSha(paths.resultSummary, MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256, "result summary");
  const manifestDigest = string(manifest.runPayloadDigest, "run payload digest");
  if (manifestDigest !== MHS_V2_FIRST_LOCAL_RUN_MANIFEST_PAYLOAD_DIGEST) throw new Error("T6L-8C3 run manifest payload digest mismatch");
  const authorities = record(manifest.authorities, "run authorities"), baseModel = record(manifest.baseModel, "base model"), hardware = record(manifest.hardware, "hardware"), seed = record(manifest.seed, "seed"), steps = record(manifest.steps, "steps"), isolation = record(manifest.protectedDataExclusion, "protected-data counters"), runLifecycle = record(manifest.lifecycle, "manifest lifecycle"), finalExport = record(manifest.finalExport, "final export");
  exact(authorities, { environmentPayloadDigest: MHS_V2_TRAINING_ENVIRONMENT_PAYLOAD_DIGEST, environmentSha256: MHS_V2_TRAINING_ENVIRONMENT_SHA256, preparationPayloadDigest: MHS_V2_TRAINING_PREPARATION_PAYLOAD_DIGEST, preparationSha256: MHS_V2_TRAINING_PREPARATION_SHA256, trainMembershipDigest: TRAIN_MEMBERSHIP, trainPayloadDigest: MHS_V2_TRAIN_PAYLOAD_DIGEST, trainSha256: MHS_V2_TRAIN_SHA256, trainingContractPayloadDigest: MHS_V2_TRAINING_CONTRACT_PAYLOAD_DIGEST, trainingContractSha256: MHS_V2_TRAINING_CONTRACT_SHA256, trainingReadyPayloadDigest: MHS_V2_TRAINING_READY_PAYLOAD_DIGEST, trainingReadySha256: MHS_V2_TRAINING_READY_SHA256, validationMembershipDigest: VALIDATION_MEMBERSHIP, validationPayloadDigest: MHS_V2_VALIDATION_PAYLOAD_DIGEST, validationSha256: MHS_V2_VALIDATION_SHA256 }, "run authorities");
  exact(baseModel, { repository: "FacebookAI/xlm-roberta-base", revision: MODEL_REVISION, tokenizerSha256: TOKENIZER_SHA, weightSha256: BASE_MODEL_SHA }, "base model authority");
  exact(manifest.toolchain, { accelerate: "0.31.0", numpy: "1.26.4", python: "3.12.10", pytorch: "2.3.1+cpu", safetensors: "0.4.3", sentencepiece: "0.2.0", tokenizers: "0.19.1", transformers: "4.42.4" }, "runtime environment");
  exact([hardware.device, hardware.cudaAvailable, hardware.cudaVisibleDevices], ["cpu", false, ""], "CPU authority"); exact(seed, { integer: MHS_V2_TRAINING_MASTER_SEED, string: MHS_V2_TRAINING_MASTER_SEED_STRING }, "seed authority");
  exact(manifest.configuration, { betas: [0.9, 0.999], decisionRule: "ARGMAX_TWO_LOGITS", epochs: 3, epsilon: 1e-8, gradientAccumulation: 1, learningRate: 2e-5, maxGradNorm: 1, maxLength: 160, optimizer: "AdamW", precision: "FP32", scheduler: "linear", trainBatchSize: 8, validationBatchSize: 8, warmupSteps: 2, weightDecay: 0.01 }, "frozen configuration");
  exact(steps, { batchesPerEpoch: 25, schedulerSteps: 75, totalOptimizerSteps: 75, validationEvaluations: 3 }, "execution accounting");
  const epochs = epochMetrics(manifest.epochs); exact(epochs.map((row) => [row.epoch, row.globalStep]), [[1, 25], [2, 50], [3, 75]], "epoch accounting");
  const selected = sortEpochs(epochs)[0]; if (selected.epoch !== 3) throw new Error("T6L-8C3 frozen checkpoint selection rule failed");
  const selectedManifest = record(manifest.selectedCheckpoint, "selected checkpoint"); exact([selectedManifest.epoch, selectedManifest.path, selectedManifest.macroF1, selectedManifest.validationLoss], [3, "checkpoints/checkpoint-epoch-03", selected.macroF1, selected.validationLoss], "selected checkpoint");
  exact(manifest.selectionRule, ["HIGHEST_VALIDATION_MACRO_F1", "LOWEST_VALIDATION_LOSS", "EARLIEST_EPOCH"], "selection rule");
  if (!Array.isArray(manifest.retainedCheckpoints) || manifest.retainedCheckpoints.length !== 2) throw new Error("T6L-8C3 retained checkpoint count mismatch");
  const epoch02 = sha256FileStreaming(paths.checkpointEpoch02Model), epoch03 = sha256FileStreaming(paths.checkpointEpoch03Model), finalModel = sha256FileStreaming(paths.finalModel);
  exact([epoch02, epoch03, finalModel], [MHS_V2_FIRST_LOCAL_EPOCH_02_MODEL_SHA256, MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256], "actual checkpoint model identities");
  const config = readJson(paths.finalConfig), tokenizerBinding = readJson(paths.tokenizerBinding); exact([config.architectures, config.label2id, config.id2label, config.torch_dtype, config.transformers_version], [["XLMRobertaForSequenceClassification"], { ALLOW: 0, BLOCK: 1 }, { "0": "ALLOW", "1": "BLOCK" }, "float32", "4.42.4"], "final model configuration"); exact(tokenizerBinding, { repository: "FacebookAI/xlm-roberta-base", revision: MODEL_REVISION, tokenizerArtifactSha256: TOKENIZER_SHA, trainingContractSha256: MHS_V2_TRAINING_CONTRACT_SHA256 }, "final tokenizer binding");
  exact([finalExport.path, finalExport.sourceCheckpoint, finalExport.format], ["final", "checkpoints/checkpoint-epoch-03", "SAFETENSORS"], "final export");
  exact(isolation, { benchmarkRawAccesses: 0, exclusionUses: 0, internalTestRawAccesses: 0, onlyAuthorizedTrainValidationUsed: true, reserveUses: 0 }, "protected-data isolation");
  exact([manifest.terminalStatus, manifest.trainingRuns, manifest.productionThresholdStatus, manifest.warnings], ["COMPLETED", 1, "NOT_SELECTED", [MHS_V2_FIRST_LOCAL_VALIDATION_WARNING]], "run completion state");
  exact([lifecycle.status, lifecycle.phase, lifecycle.runManifestSha256, lifecycle.trainingContractSha256], ["COMPLETED", "T6L-8C2", MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, MHS_V2_TRAINING_CONTRACT_SHA256], "lifecycle");
  exact([summary.status, summary.epochsCompleted, summary.optimizerSteps, summary.selectedCheckpoint, summary.selectedModelSha256, summary.runManifestSha256, summary.productionThresholdStatus, summary.warnings], ["FIRST_TRAINING_RUN_COMPLETED", 3, 75, "checkpoints/checkpoint-epoch-03", finalModel, MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, "NOT_SELECTED", [MHS_V2_FIRST_LOCAL_VALIDATION_WARNING]], "result summary");
  exact(summary.epochs, epochs, "result-summary epoch evidence"); exact([summary.internalTestRawAccesses, summary.benchmarkRawAccesses, summary.reserveUses, summary.exclusionUses], [0, 0, 0, 0], "summary isolation");
  const runnerSha = sha256FileStreaming(paths.runner), environment = record(manifest.toolchain, "toolchain"), configuration = record(manifest.configuration, "configuration");
  const payload: MhsV2FirstLocalTrainingCertificationPayload = {
    schemaVersion: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_VERSION, phase: "T6L-8C3", status: "FIRST_TRAINING_RUN_CERTIFIED",
    authorities: { releaseSha256: RELEASE_SHA, releasePayloadDigest: RELEASE_PAYLOAD, eligibilitySha256: ELIGIBILITY_SHA, eligibilityPayloadDigest: ELIGIBILITY_PAYLOAD, candidateSha256BoundThroughRelease: CANDIDATE_SHA, universeSha256BoundThroughRelease: UNIVERSE_SHA, universePayloadDigest: UNIVERSE_PAYLOAD, universeMembershipDigest: UNIVERSE_MEMBERSHIP, historicalSplitSha256: HISTORICAL_SPLIT_SHA, internalTestFreezeSha256: INTERNAL_TEST_FREEZE_SHA, externalBenchmarkVersion: "STHN_TEXT_MODERATION_FIXTURES_V1R", externalBenchmarkSha256BoundThroughEligibility: BENCHMARK_SHA, finalAssignmentCertificationSha256: FINAL_ASSIGNMENT_SHA, finalAssignmentPayloadDigest: FINAL_ASSIGNMENT_PAYLOAD, finalAssignmentDigest: FINAL_ASSIGNMENT_DIGEST, developmentProjectionSha256: "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18", developmentProjectionPayloadDigest: "80d8889daff1eb6e0e965e45b7bcffeb8b65388bd516acca2a0cd9863c89767d", projectionManifestSha256: "6886efd351c6422412c9809ae5af39e8f3bc4404b75d106aa34af5110d21f21a", projectionManifestPayloadDigest: "016b0b5581b9fdcc1cc85e3eeca9a81e05af9ece7eb183971c1f9c5d94c081f5", materializationSha256: MHS_V2_MATERIALIZATION_SHA256, materializationPayloadDigest: MHS_V2_MATERIALIZATION_PAYLOAD_DIGEST, trainingReadySha256: MHS_V2_TRAINING_READY_SHA256, trainingReadyPayloadDigest: MHS_V2_TRAINING_READY_PAYLOAD_DIGEST, preparationSha256: MHS_V2_TRAINING_PREPARATION_SHA256, preparationPayloadDigest: MHS_V2_TRAINING_PREPARATION_PAYLOAD_DIGEST, environmentSha256: MHS_V2_TRAINING_ENVIRONMENT_SHA256, environmentPayloadDigest: MHS_V2_TRAINING_ENVIRONMENT_PAYLOAD_DIGEST, trainingContractSha256: MHS_V2_TRAINING_CONTRACT_SHA256, trainingContractPayloadDigest: MHS_V2_TRAINING_CONTRACT_PAYLOAD_DIGEST, runnerSha256: runnerSha },
    run: { runId: string(manifest.runId, "run ID"), outputRoot: MHS_V2_TRAINING_OUTPUT_ROOT, runManifestPath: path.relative(process.cwd(), paths.runManifest).replace(/\\/gu, "/"), runManifestSha256: MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, runManifestPayloadDigest: manifestDigest, resultSummaryPath: path.relative(process.cwd(), paths.resultSummary).replace(/\\/gu, "/"), resultSummarySha256: MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256, lifecyclePath: path.relative(process.cwd(), paths.lifecycle).replace(/\\/gu, "/"), lifecycleStatus: "COMPLETED", resultStatus: "FIRST_TRAINING_RUN_COMPLETED", startedAt: string(runLifecycle.startedAt, "start timestamp"), endedAt: string(runLifecycle.endedAt, "end timestamp"), elapsedSeconds: number(runLifecycle.elapsedSeconds, "elapsed seconds") },
    inputs: { TRAIN: { rows: 200, ALLOW: 110, BLOCK: 90, sha256: MHS_V2_TRAIN_SHA256, payloadDigest: MHS_V2_TRAIN_PAYLOAD_DIGEST, membershipDigest: TRAIN_MEMBERSHIP }, VALIDATION: { rows: 13, ALLOW: 9, BLOCK: 4, sha256: MHS_V2_VALIDATION_SHA256, payloadDigest: MHS_V2_VALIDATION_PAYLOAD_DIGEST, membershipDigest: VALIDATION_MEMBERSHIP } },
    execution: { device: "CPU", cudaAvailable: false, epochsCompleted: 3, optimizerSteps: 75, schedulerSteps: 75, validationEvaluations: 3, seedString: MHS_V2_TRAINING_MASTER_SEED_STRING, seedInteger: MHS_V2_TRAINING_MASTER_SEED, environment: environment as Readonly<Record<string, string>>, configuration }, epochMetrics: epochs,
    checkpoints: { conceptualCount: 3, retainedCount: 2, maximumRetained: 2, retained: [{ epoch: 2, path: "checkpoints/checkpoint-epoch-02", modelSha256: epoch02 }, { epoch: 3, path: "checkpoints/checkpoint-epoch-03", modelSha256: epoch03 }], selectionRule: ["HIGHEST_VALIDATION_MACRO_F1", "LOWEST_VALIDATION_LOSS", "EARLIEST_EPOCH"], independentlySelectedEpoch: 3, selectedPath: "checkpoints/checkpoint-epoch-03", selectedCheckpointModelSha256: epoch03, finalModelSha256: finalModel, finalModelMatchesSelectedCheckpoint: true },
    isolation: { internalTestRawAccesses: 0, benchmarkRawAccesses: 0, reserveUses: 0, exclusionUses: 0, onlyAuthorizedTrainValidationUsed: true, certificationProtectedPayloadReads: 0, certificationClassifierEvaluations: 0 },
    validationCaveat: { warning: MHS_V2_FIRST_LOCAL_VALIDATION_WARNING, rows: 13, ALLOW: 9, BLOCK: 4, preliminaryDevelopmentEvidence: true, highSamplingVariance: true, epoch3BlockRecall: 0.5 },
    certificationChecks: { authorizedDatasetAndMaterialization: true, onlyAuthorizedTrainValidationUsed: true, protectedPopulationsUntouched: true, frozenModelRevisionTokenizerUsed: true, frozenCpuEnvironmentUsed: true, frozenHyperparametersUsed: true, deterministicSeedUsed: true, exactEpochStepEvaluationCounts: true, checkpointRetentionValid: true, checkpointSelectionRuleValid: true, selectedCheckpointHashVerifiedFromFile: true, finalModelHashVerifiedFromFile: true, runManifestHashVerified: true, resultSummaryHashVerified: true, cleanCompletionVerified: true, productionThresholdUnselected: true, validationWarningPreserved: true },
    disposition: { executionIntegrityCertified: true, eligibleForNextControlledEvaluationStage: true, productionReady: false, thresholdSelected: false, internalTestValidated: false, externalBenchmarkValidated: false, modelAdequacyCertified: false, exactNextAction: "STOP_AFTER_T6L_8C3_AWAIT_SEPARATE_CONTROLLED_EVALUATION_AUTHORIZATION" }, certifiedAt: string(runLifecycle.endedAt, "certified timestamp"),
  };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2FirstLocalTrainingCertification(artifact); return artifact;
};

export const validateMhsV2FirstLocalTrainingCertification = (artifact: MhsV2FirstLocalTrainingCertificationArtifact): void => {
  const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_VERSION || artifact.phase !== "T6L-8C3" || artifact.status !== "FIRST_TRAINING_RUN_CERTIFIED" || certificationPayloadDigest !== digest(payload) || certificationPayloadDigest !== MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8C3 certification identity or canonical payload");
  if (artifact.run.runManifestSha256 !== MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256 || artifact.run.resultSummarySha256 !== MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256 || artifact.execution.device !== "CPU" || artifact.execution.cudaAvailable || artifact.execution.epochsCompleted !== 3 || artifact.execution.optimizerSteps !== 75 || artifact.execution.validationEvaluations !== 3 || artifact.execution.seedInteger !== MHS_V2_TRAINING_MASTER_SEED) throw new Error("Invalid T6L-8C3 execution evidence");
  if (artifact.inputs.TRAIN.rows !== 200 || artifact.inputs.VALIDATION.rows !== 13 || artifact.epochMetrics.length !== 3 || sortEpochs(artifact.epochMetrics)[0].epoch !== 3 || artifact.checkpoints.retainedCount !== 2 || artifact.checkpoints.retained.length !== 2 || artifact.checkpoints.independentlySelectedEpoch !== 3 || artifact.checkpoints.selectedCheckpointModelSha256 !== MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256 || artifact.checkpoints.finalModelSha256 !== MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256) throw new Error("Invalid T6L-8C3 data or checkpoint evidence");
  if (Object.values(artifact.certificationChecks).some((value) => value !== true) || Object.values(artifact.isolation).some((value) => typeof value === "number" ? value !== 0 : value !== true) || artifact.validationCaveat.warning !== MHS_V2_FIRST_LOCAL_VALIDATION_WARNING || artifact.validationCaveat.epoch3BlockRecall !== 0.5 || artifact.disposition.productionReady || artifact.disposition.thresholdSelected || artifact.disposition.internalTestValidated || artifact.disposition.externalBenchmarkValidated || artifact.disposition.modelAdequacyCertified) throw new Error("Invalid T6L-8C3 boundary or disposition");
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2FirstLocalTrainingCertification = (artifact: MhsV2FirstLocalTrainingCertificationArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2FirstLocalTrainingCertification(artifact); fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8C3 certification exists; overwrite refused");
  const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8C3 certification publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
