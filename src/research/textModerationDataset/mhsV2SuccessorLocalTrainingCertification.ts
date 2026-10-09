import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_CONTRACT_SHA256,
  MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_STRATEGY_SHA256,
  validateMhsV2SuccessorContract,
  validateMhsV2SuccessorStrategy,
} from "./mhsV2SuccessorTrainingContract";
import {
  MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256,
  MHS_V2_SUCCESSOR_MODEL_SHA256,
  MHS_V2_SUCCESSOR_RUNNER_SHA256,
  validateMhsV2SuccessorLocalPreparation,
} from "./mhsV2SuccessorLocalTrainingPreparation";
import {
  MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_PROVENANCE_SHA256,
  validateMhsV2SuccessorProvenanceRecovery,
} from "./mhsV2SuccessorTrainingProvenanceRecovery";
import {
  MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_WAIVER_SHA256,
  validateMhsV2SuccessorTrainingProvenanceWaiver,
} from "./mhsV2SuccessorTrainingProvenanceWaiver";
import { sha256FileStreaming } from "./mhsV2SuccessorTrainingProvenanceRecovery";

export const MHS_V2_SUCCESSOR_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_LOCAL_TRAINING_RUN_CERTIFICATION_V1" as const;
export const MHS_V2_SUCCESSOR_CERTIFICATION_VERSION = "MHS_V2_SUCCESSOR_LOCAL_TRAINING_RUN_CERTIFICATION_V1" as const;
export const MHS_V2_SUCCESSOR_CERTIFICATION_FILENAME = "mhs-v2-successor-local-training-run-certification-v1.json" as const;
export const MHS_V2_SUCCESSOR_CERTIFICATION_SHA256 = "00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34";
export const MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST = "2545404d8aac500431f2ff5658c46272762bfdbefeb2f2243ec35d74e137e7e7";
export const MHS_V2_SUCCESSOR_VALIDATION_WARNING = "VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE" as const;

const RUN_MANIFEST_SHA = "b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac";
const RUN_MANIFEST_PAYLOAD = "d7ddb001bdc817cf14ba0f8516dacaed08e69d069d5eefe5a7243841c640059b";
const LIFECYCLE_SHA = "47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9";
const RESULT_SHA = "8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e";
const EPOCH_02_MODEL_SHA = "37394daf66404b753c059262230192536a2d48c67f60a990d2f2c06944eeace7";
const SELECTED_MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const TRAIN_SHA = "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74";
const TRAIN_PAYLOAD = "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff";
const VALIDATION_SHA = "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29";
const VALIDATION_PAYLOAD = "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095";
const PROJECTION_SHA = "1d2e92c67660998ea5149abd7c572170f5bc4fb1594cfc3276b412d3caa02e18";
const PROJECTION_PAYLOAD = "80d8889daff1eb6e0e965e45b7bcffeb8b65388bd516acca2a0cd9863c89767d";
const ENVIRONMENT_SHA = "3db1643fe6d65b1b0725751dde56088a70317ae9ae60bc83b5c7a880af85a9d8";
const BASE_WEIGHT_SHA = "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const FINAL_CONFIG_SHA = "2f48155190967d11204a0ad87787a179e4ec0d708ac47e8730a1c8ed77f6ec78";
const FINAL_TOKENIZER_BINDING_SHA = "151e78bcd3f3132a49671497baac2f7c8fa0af6808e6572a41b57b1d092a4629";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
type Json = Record<string, any>;

export interface MhsV2SuccessorCertificationPaths {
  readonly strategy: string; readonly contract: string; readonly preparation: string; readonly d0: string; readonly waiver: string;
  readonly runner: string; readonly modelImplementation: string; readonly train: string; readonly validation: string; readonly projection: string;
  readonly environment: string; readonly baseWeights: string; readonly tokenizer: string; readonly tokenizerAuthorityBinding: string;
  readonly runManifest: string; readonly lifecycle: string; readonly resultSummary: string; readonly epoch02Model: string; readonly epoch03Model: string;
  readonly finalModel: string; readonly finalConfig: string; readonly finalTokenizerBinding: string;
}

export interface MhsV2SuccessorCertificationArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_CERTIFICATION_SCHEMA; readonly certificationVersion: typeof MHS_V2_SUCCESSOR_CERTIFICATION_VERSION;
  readonly phase: "T6L-8E-D"; readonly status: "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER";
  readonly authorities: Json; readonly provenanceWaiver: Json; readonly run: Json; readonly inputs: Json; readonly modelAndTokenizer: Json;
  readonly objective: Json; readonly categoryAuthority: Json; readonly masking: Json; readonly execution: Json; readonly preprocessing: Json;
  readonly epochMetrics: readonly Json[]; readonly checkpoints: Json; readonly limitations: Json; readonly isolation: Json;
  readonly certificationExecution: Readonly<Record<string, number>>; readonly unsupportedConclusions: readonly string[]; readonly disposition: Json;
  readonly certifiedAt: string; readonly certificationPayloadDigest: string;
}

export const defaultMhsV2SuccessorCertificationPaths = (root = process.cwd()): MhsV2SuccessorCertificationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), training = path.join(mhs, "training");
  const cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  const first = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1");
  const run = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1");
  return {
    strategy: path.join(training, "mhs-v2-successor-training-strategy-analysis-v1.json"), contract: path.join(training, "mhs-v2-successor-training-contract-v1.json"), preparation: path.join(training, "mhs-v2-successor-local-training-runner-preparation-v1.json"), d0: path.join(training, "mhs-v2-successor-training-provenance-recovery-v1.json"), waiver: path.join(training, "mhs-v2-successor-training-provenance-waiver-v1.json"),
    runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py"), modelImplementation: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_model.py"), train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"), projection: path.join(mhs, "development/mhs-development-text-projection-v2.jsonl"), environment: path.join(training, "mhs-v2-training-environment-authority-v1.json"), baseWeights: path.join(cache, "model.safetensors"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerAuthorityBinding: path.join(first, "final/tokenizer-binding.json"),
    runManifest: path.join(run, "run/run-manifest.json"), lifecycle: path.join(run, "run/lifecycle.json"), resultSummary: path.join(run, "run/result-summary.json"), epoch02Model: path.join(run, "checkpoints/checkpoint-epoch-02/model.safetensors"), epoch03Model: path.join(run, "checkpoints/checkpoint-epoch-03/model.safetensors"), finalModel: path.join(run, "final/model.safetensors"), finalConfig: path.join(run, "final/config.json"), finalTokenizerBinding: path.join(run, "final/tokenizer-binding.json"),
  };
};

const read = (filename: string): Json => JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
const exactSha = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8E-D ${label} SHA mismatch`); };
const same = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8E-D ${label} mismatch`); };

export const createMhsV2SuccessorLocalTrainingCertification = (paths: MhsV2SuccessorCertificationPaths): MhsV2SuccessorCertificationArtifact => {
  [[paths.strategy, MHS_V2_SUCCESSOR_STRATEGY_SHA256, "strategy"], [paths.contract, MHS_V2_SUCCESSOR_CONTRACT_SHA256, "contract"], [paths.preparation, MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256, "preparation"], [paths.d0, MHS_V2_SUCCESSOR_PROVENANCE_SHA256, "D0"], [paths.waiver, MHS_V2_SUCCESSOR_WAIVER_SHA256, "waiver"], [paths.runner, MHS_V2_SUCCESSOR_RUNNER_SHA256, "runner"], [paths.modelImplementation, MHS_V2_SUCCESSOR_MODEL_SHA256, "model implementation"], [paths.train, TRAIN_SHA, "TRAIN"], [paths.validation, VALIDATION_SHA, "VALIDATION"], [paths.projection, PROJECTION_SHA, "projection"], [paths.environment, ENVIRONMENT_SHA, "environment"], [paths.baseWeights, BASE_WEIGHT_SHA, "base weights"], [paths.tokenizer, TOKENIZER_SHA, "tokenizer"], [paths.tokenizerAuthorityBinding, TOKENIZER_BINDING_SHA, "tokenizer authority binding"], [paths.runManifest, RUN_MANIFEST_SHA, "run manifest"], [paths.lifecycle, LIFECYCLE_SHA, "lifecycle"], [paths.resultSummary, RESULT_SHA, "result summary"], [paths.epoch02Model, EPOCH_02_MODEL_SHA, "epoch 2 model"], [paths.epoch03Model, SELECTED_MODEL_SHA, "epoch 3 model"], [paths.finalModel, SELECTED_MODEL_SHA, "final model"], [paths.finalConfig, FINAL_CONFIG_SHA, "final config"], [paths.finalTokenizerBinding, FINAL_TOKENIZER_BINDING_SHA, "final tokenizer binding"]].forEach(([file, hash, label]) => exactSha(file, hash, label));
  const strategy = read(paths.strategy), contract = read(paths.contract), preparation = read(paths.preparation), d0 = read(paths.d0), waiver = read(paths.waiver), manifest = read(paths.runManifest), lifecycle = read(paths.lifecycle), summary = read(paths.resultSummary);
  validateMhsV2SuccessorStrategy(strategy); validateMhsV2SuccessorContract(contract);
  validateMhsV2SuccessorLocalPreparation(preparation as Parameters<typeof validateMhsV2SuccessorLocalPreparation>[0]);
  validateMhsV2SuccessorProvenanceRecovery(d0 as Parameters<typeof validateMhsV2SuccessorProvenanceRecovery>[0]);
  validateMhsV2SuccessorTrainingProvenanceWaiver(waiver as Parameters<typeof validateMhsV2SuccessorTrainingProvenanceWaiver>[0]);
  same([strategy.strategyPayloadDigest, strategy.selectedStrategy], [MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST, "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING"], "strategy authority");
  same([contract.contractPayloadDigest, contract.status], [MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST, "SUCCESSOR_TRAINING_CONTRACT_READY"], "contract authority");
  same([preparation.preparationPayloadDigest, preparation.status], [MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST, "LOCAL_SUCCESSOR_TRAINING_READY"], "preparation authority");
  same([d0.recoveryPayloadDigest, d0.status, waiver.waiverPayloadDigest, waiver.status, waiver.admissibility.certificationAdmissible], [MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST, "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION", MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST, "PROVENANCE_WAIVER_ACCEPTED_CERTIFICATION_ADMISSIBLE", true], "D0/D0W authority");
  same([manifest.runPayloadDigest, manifest.terminalStatus, lifecycle.status, summary.status], [RUN_MANIFEST_PAYLOAD, "COMPLETED", "COMPLETED", "SUCCESSOR_TRAINING_RUN_COMPLETED"], "completed run");
  same(manifest.authorities, { developmentProjectionPayloadDigest: PROJECTION_PAYLOAD, developmentProjectionSha256: PROJECTION_SHA, strategyPayloadDigest: MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST, strategySha256: MHS_V2_SUCCESSOR_STRATEGY_SHA256, successorTrainingContractPayloadDigest: MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST, successorTrainingContractSha256: MHS_V2_SUCCESSOR_CONTRACT_SHA256, trainMembershipDigest: "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61", trainPayloadDigest: TRAIN_PAYLOAD, trainSha256: TRAIN_SHA, validationMembershipDigest: "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164", validationPayloadDigest: VALIDATION_PAYLOAD, validationSha256: VALIDATION_SHA }, "run authorities");
  if (manifest.authorities.preparationSha256 !== undefined || manifest.authorities.runnerSha256 !== undefined || manifest.authorities.modelImplementationSha256 !== undefined) throw new Error("T6L-8E-D waived direct binding unexpectedly present");
  const expectedConfiguration = { betas: [0.9, 0.999], decisionRule: "ARGMAX_BINARY_LOGITS", effectiveBatchSize: 8, epochs: 3, epsilon: 1e-8, gradientAccumulation: 1, learningRate: 2e-5, maxGradNorm: 1, maxLength: 160, optimizer: "AdamW", precision: "FP32", sampling: "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT", scheduler: "linear", trainBatchSize: 8, validationBatchSize: 8, warmupSteps: 2, weightDecay: 0.01 };
  same(manifest.configuration, expectedConfiguration, "configuration"); same(manifest.steps, { batchesPerEpoch: 25, schedulerSteps: 75, totalOptimizerSteps: 75, validationEvaluations: 3 }, "step accounting");
  same(manifest.seed, { integer: 926509953, string: "STHN_T6L_8E_B_MHS_V2_SUCCESSOR_CATEGORY_AWARE_TRAINING_RUN_V1" }, "seed");
  same(manifest.model, { auxiliaryHeadLabels: 5, auxiliaryWeight: 0.25, binaryHeadLabels: 2, category2id: { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 2, SEXUAL: 3, THREAT_OR_VIOLENCE: 4 } }, "model objective");
  same(manifest.baseModel, { repository: "FacebookAI/xlm-roberta-base", revision: "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", source: "ORIGINAL_PINNED_BASE", tokenizerSha256: TOKENIZER_SHA, weightSha256: BASE_WEIGHT_SHA }, "base model");
  same(manifest.toolchain, { accelerate: "0.31.0", numpy: "1.26.4", python: "3.12.10", pytorch: "2.3.1+cpu", safetensors: "0.4.3", sentencepiece: "0.2.0", tokenizers: "0.19.1", transformers: "4.42.4" }, "toolchain");
  same([manifest.hardware.device, manifest.hardware.cudaAvailable, manifest.hardware.resourceDiagnostics.authoritativeForEligibility], ["cpu", false, false], "hardware policy");
  const expectedEpochs = [
    { epoch: 1, globalStep: 25, binaryValidationLoss: 0.6231505870819092, accuracy: 0.6923076923076923, allowPrecision: 0.6923076923076923, allowRecall: 1, allowF1: 0.8181818181818181, blockPrecision: 0, blockRecall: 0, blockF1: 0, macroF1: 0.40909090909090906, balancedAccuracy: 0.5, confusionMatrix: [[9, 0], [4, 0]] },
    { epoch: 2, globalStep: 50, binaryValidationLoss: 0.5079421401023865, accuracy: 0.6923076923076923, allowPrecision: 0.6923076923076923, allowRecall: 1, allowF1: 0.8181818181818181, blockPrecision: 0, blockRecall: 0, blockF1: 0, macroF1: 0.40909090909090906, balancedAccuracy: 0.5, confusionMatrix: [[9, 0], [4, 0]] },
    { epoch: 3, globalStep: 75, binaryValidationLoss: 0.4987126886844635, accuracy: 0.7692307692307693, allowPrecision: 0.8, allowRecall: 0.8888888888888888, allowF1: 0.8421052631578948, blockPrecision: 0.6666666666666666, blockRecall: 0.5, blockF1: 0.5714285714285715, macroF1: 0.7067669172932332, balancedAccuracy: 0.6944444444444444, confusionMatrix: [[8, 1], [2, 2]] },
  ];
  const durableEpochs = manifest.epochs.map(({ combinedTrainingLoss: _ignored, ...row }: Json) => row); same(durableEpochs, expectedEpochs, "epoch metrics");
  same([lifecycle.startedAt, lifecycle.completedAt, manifest.lifecycle.elapsedSeconds], ["2026-09-29T19:18:12.088Z", "2026-09-29T19:34:29.780Z", 977.7030000000013], "lifecycle timestamps");
  same([summary.epochsCompleted, summary.optimizerSteps, summary.selectedCheckpoint, summary.selectedModelSha256, summary.productionThresholdStatus], [3, 75, "checkpoints/checkpoint-epoch-03", SELECTED_MODEL_SHA, "NOT_SELECTED"], "summary");
  if (!Array.isArray(manifest.retainedCheckpoints) || manifest.retainedCheckpoints.length !== 2) throw new Error("T6L-8E-D retained checkpoint mismatch");
  for (const checkpoint of manifest.retainedCheckpoints as Json[]) for (const file of checkpoint.files as Json[]) { const filename = path.resolve(path.dirname(path.dirname(paths.runManifest)), checkpoint.path, file.filename); if (!fs.existsSync(filename) || fs.statSync(filename).size !== file.byteSize) throw new Error("T6L-8E-D checkpoint inventory mismatch"); }
  const source = `${fs.readFileSync(paths.runner, "utf8")}\n${fs.readFileSync(paths.modelImplementation, "utf8")}`;
  if (!/auxiliary_logits\.sum\(\) \* 0\.0/u.test(source) || !/binary_loss \+ AUXILIARY_WEIGHT \* auxiliary_loss/u.test(source)) throw new Error("T6L-8E-D prepared masking implementation mismatch");
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_SUCCESSOR_CERTIFICATION_VERSION, phase: "T6L-8E-D" as const, status: "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER" as const,
    authorities: { d0: { sha256: MHS_V2_SUCCESSOR_PROVENANCE_SHA256, payloadDigest: MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST, status: d0.status }, waiver: { sha256: MHS_V2_SUCCESSOR_WAIVER_SHA256, payloadDigest: MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST, status: waiver.status }, strategy: { sha256: MHS_V2_SUCCESSOR_STRATEGY_SHA256, payloadDigest: MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST }, contract: { sha256: MHS_V2_SUCCESSOR_CONTRACT_SHA256, payloadDigest: MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST }, preparation: { sha256: MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256, payloadDigest: MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST }, expectedPreparedRunnerSha256: MHS_V2_SUCCESSOR_RUNNER_SHA256, expectedPreparedModelImplementationSha256: MHS_V2_SUCCESSOR_MODEL_SHA256 },
    provenanceWaiver: { requiredForCertification: true, accepted: true, code: "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", appliesTo: ["DIRECT_RUN_TO_8E_C_PREPARATION_LINK", "EXACT_HISTORICAL_RUNNER_BYTES_EXECUTED", "EXACT_HISTORICAL_CUSTOM_MODEL_BYTES_EXECUTED"], directRunBindings: { preparationSha256: null, runnerSha256: null, modelImplementationSha256: null }, exactHistoricalExecutedSourceBytesProven: false, provenanceRecovered: false, structuralAndCorroboratingPreparedSourceEvidenceAccepted: true, certificationMustDiscloseWaiver: true },
    run: { runId: manifest.runId, manifestSha256: RUN_MANIFEST_SHA, manifestPayloadDigest: RUN_MANIFEST_PAYLOAD, lifecycleSha256: LIFECYCLE_SHA, lifecycleStatus: lifecycle.status, resultSummarySha256: RESULT_SHA, resultStatus: summary.status, startedAt: lifecycle.startedAt, completedAt: lifecycle.completedAt, elapsedSeconds: manifest.lifecycle.elapsedSeconds, epochsCompleted: 3, optimizerSteps: 75, schedulerSteps: 75, validationEvaluations: 3, historicalTrainingRuns: 1 },
    inputs: { TRAIN: { sha256: TRAIN_SHA, payloadDigest: TRAIN_PAYLOAD, rows: 200, ALLOW: 110, BLOCK: 90 }, VALIDATION: { sha256: VALIDATION_SHA, payloadDigest: VALIDATION_PAYLOAD, rows: 13, ALLOW: 9, BLOCK: 4 }, developmentProjection: { sha256: PROJECTION_SHA, payloadDigest: PROJECTION_PAYLOAD, rows: 213 } },
    modelAndTokenizer: { baseModel: manifest.baseModel, tokenizer: { implementation: "XLMRobertaTokenizerFast", sha256: TOKENIZER_SHA, authorityBindingSha256: TOKENIZER_BINDING_SHA, finalBindingSha256: FINAL_TOKENIZER_BINDING_SHA }, environmentSha256: ENVIRONMENT_SHA, toolchain: manifest.toolchain },
    objective: { primary: { mapping: { ALLOW: 0, BLOCK: 1 }, loss: "TWO_LOGIT_CROSS_ENTROPY", appliesTo: "ALL_ROWS", weight: 1 }, auxiliary: { category2id: manifest.model.category2id, loss: "MASKED_FIVE_LOGIT_CROSS_ENTROPY", appliesTo: "ELIGIBLE_SUPPORTED_BLOCK_ROWS_ONLY", weight: 0.25, otherInappropriateIncluded: false }, combined: "BINARY_CE_PLUS_0_25_TIMES_MASKED_AUXILIARY_CE", preparedImplementationQualification: "EXPECTED_PREPARED_SOURCE_IDENTITIES_UNDER_ACCEPTED_PROVENANCE_WAIVER_NOT_DIRECT_EXECUTED_SOURCE_ATTESTATION" },
    categoryAuthority: { TRAIN: preparation.categoryAuthority.train, VALIDATION: preparation.categoryAuthority.validation }, masking: { binaryAllRows: true, allowAuxiliaryEligible: false, supportedBlockAuxiliaryEligible: true, otherInappropriateEligible: false, unsupportedBlockFailsClosed: true, zeroEligibleBatch: "DIFFERENTIABLE_ZERO_NO_EMPTY_CROSS_ENTROPY" },
    execution: { configuration: expectedConfiguration, workers: 0, batchesPerEpoch: 25, optimizerSteps: 75, schedulerSteps: 75, validationEvaluations: 3, seed: manifest.seed, device: "CPU_REQUIRED", gpuAuthorized: false, ramEligibilityGate: "NONE", resourceDiagnosticsAuthoritativeForEligibility: false, sampling: { policy: "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT", oversampling: false, categoryBalancing: false, classWeighting: "NONE", augmentation: false } },
    preprocessing: { tokenizer: "XLMRobertaTokenizerFast", exactUnicode: true, maxLength: 160, padding: "DYNAMIC_RIGHT", truncation: "DETERMINISTIC_RIGHT", trainTruncations: 0, validationTruncations: 0, normalization: false, rewriting: false, translation: false, transliteration: false, augmentation: false },
    epochMetrics: expectedEpochs,
    checkpoints: { retainedCount: 2, maximumRetained: 2, retained: [{ epoch: 2, path: "checkpoints/checkpoint-epoch-02", modelSha256: EPOCH_02_MODEL_SHA }, { epoch: 3, path: "checkpoints/checkpoint-epoch-03", modelSha256: SELECTED_MODEL_SHA }], selectionRule: manifest.selectionRule, selectedEpoch: 3, selectedPath: "checkpoints/checkpoint-epoch-03", selectionReason: "STRICTLY_HIGHEST_BINARY_VALIDATION_MACRO_F1", tieBreakUsed: false, auxiliaryMetricsSelectionAuthority: false, selectedCheckpointModelSha256: SELECTED_MODEL_SHA, finalModelSha256: SELECTED_MODEL_SHA, finalModelMatchesSelectedCheckpoint: true },
    limitations: { validationWarning: MHS_V2_SUCCESSOR_VALIDATION_WARNING, validationRows: 13, highSamplingVariance: true, broadModelQualityConclusionsSupported: false, auxiliaryComponentLossesPersisted: false, auxiliaryValidationMetricsPersisted: false, trainerRuntimeSeconds: { value: 882.6706, classification: "TERMINAL_ONLY_CORROBORATING_NOT_DURABLE_RUN_AUTHORITY" }, totalReportedTrainingLoss: { value: 1.0419386291503907, classification: "TERMINAL_ONLY_CORROBORATING_NOT_DURABLE_RUN_AUTHORITY" }, durableLifecycleElapsedSeconds: 977.7030000000013 },
    isolation: { protectedInference: 0, protectedRawTextAccesses: 0, internalTestAccesses: 0, externalBenchmarkAccesses: 0, reserveUses: 0, exclusionUses: 0, thresholdSelections: 0, productionThresholdStatus: "NOT_SELECTED", protectedEvaluationAuthorized: false, productionAuthorized: false },
    certificationExecution: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 },
    unsupportedConclusions: ["EXACT_HISTORICAL_RUNNER_SOURCE_BYTES_PROVEN", "EXACT_HISTORICAL_MODEL_IMPLEMENTATION_BYTES_PROVEN", "PROVENANCE_RECOVERED", "SUCCESSOR_BETTER_THAN_FIRST_CANDIDATE", "SUCCESSOR_WORSE_THAN_FIRST_CANDIDATE", "AUXILIARY_STRATEGY_SUCCESSFUL_OVERALL", "AUXILIARY_STRATEGY_FAILED_OVERALL", "PROTECTED_BENCHMARK_IMPROVEMENT", "PROTECTED_BENCHMARK_REGRESSION", "PRODUCTION_READINESS", "CALIBRATED_CONFIDENCE", "PRODUCTION_THRESHOLD", "PRODUCTION_APPROVAL"],
    disposition: { executionIntegrityCertified: true, certifiedOnlyWithProvenanceWaiver: true, continuedResearchAuthorized: true, protectedEvaluationAuthorized: false, productionAuthorized: false, thresholdSelected: false, exactNextPhase: "T6L-8F-A_SUCCESSOR_EVALUATION_METHODOLOGY_BENCHMARK_REUSE_CONTROL_DECISION" }, certifiedAt: lifecycle.completedAt,
  };
  const artifact: MhsV2SuccessorCertificationArtifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2SuccessorLocalTrainingCertification(artifact); return artifact;
};

export const validateMhsV2SuccessorLocalTrainingCertification = (artifact: MhsV2SuccessorCertificationArtifact): void => {
  const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_SUCCESSOR_CERTIFICATION_VERSION || artifact.phase !== "T6L-8E-D" || artifact.status !== "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER" || certificationPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8E-D identity or payload");
  if (MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST && certificationPayloadDigest !== MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8E-D pinned payload");
  if (MHS_V2_SUCCESSOR_CERTIFICATION_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_SUCCESSOR_CERTIFICATION_SHA256) throw new Error("Invalid T6L-8E-D pinned artifact");
  if (!artifact.provenanceWaiver.requiredForCertification || !artifact.provenanceWaiver.accepted || artifact.provenanceWaiver.exactHistoricalExecutedSourceBytesProven !== false || artifact.provenanceWaiver.provenanceRecovered !== false || !artifact.disposition.certifiedOnlyWithProvenanceWaiver || artifact.isolation.protectedEvaluationAuthorized !== false || artifact.isolation.productionAuthorized !== false || artifact.isolation.productionThresholdStatus !== "NOT_SELECTED" || Object.values(artifact.certificationExecution).some((value) => value !== 0)) throw new Error("Invalid T6L-8E-D waiver, isolation, or execution boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorLocalTrainingCertification = (artifact: MhsV2SuccessorCertificationArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorLocalTrainingCertification(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_CERTIFICATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8E-D certification exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8E-D publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
