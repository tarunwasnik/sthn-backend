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

export const MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_LOCAL_TRAINING_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_SUCCESSOR_LOCAL_PREPARATION_VERSION = "MHS_V2_SUCCESSOR_LOCAL_TRAINING_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_SUCCESSOR_LOCAL_PREPARATION_FILENAME = "mhs-v2-successor-local-training-runner-preparation-v1.json" as const;
export const MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256 = "61c8aaaa0f05330638c880a4cd017d6504509458939d28cb4562d5d3bc151c6f";
export const MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST = "430f9d9667ca91b7f7108171116c7f6d6c0c0c9a98d52a9e33608228d6267942";
export const MHS_V2_SUCCESSOR_RUNNER_SHA256 = "2a6fc2a2f36796a4e1845d07edacf9c7e54e8bc24291838ef51733c7942c25ed";
export const MHS_V2_SUCCESSOR_MODEL_SHA256 = "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831";
export const MHS_V2_SUCCESSOR_LOCAL_PREPARED_AT = "2026-09-30T00:00:00.000Z" as const;

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
const OUTPUT_ROOT = "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));

export interface MhsV2SuccessorLocalPreparationPaths {
  readonly strategy: string; readonly contract: string; readonly environment: string;
  readonly train: string; readonly validation: string; readonly projection: string;
  readonly runner: string; readonly model: string; readonly baseWeights: string;
  readonly tokenizer: string; readonly tokenizerBinding: string; readonly outputRoot: string;
}

export interface MhsV2SuccessorLocalPreparationArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SCHEMA;
  readonly preparationVersion: typeof MHS_V2_SUCCESSOR_LOCAL_PREPARATION_VERSION;
  readonly phase: "T6L-8E-C"; readonly status: "LOCAL_SUCCESSOR_TRAINING_READY";
  readonly authorities: Readonly<Record<string, unknown>>; readonly implementation: Readonly<Record<string, unknown>>;
  readonly configuration: Readonly<Record<string, unknown>>; readonly categoryAuthority: Readonly<Record<string, unknown>>;
  readonly objectives: Readonly<Record<string, unknown>>; readonly checkpointing: Readonly<Record<string, unknown>>;
  readonly lifecycle: Readonly<Record<string, unknown>>; readonly resourcePolicy: Readonly<Record<string, unknown>>;
  readonly verification: Readonly<Record<string, unknown>>; readonly boundaries: Readonly<Record<string, number>>;
  readonly preparedAt: typeof MHS_V2_SUCCESSOR_LOCAL_PREPARED_AT; readonly preparationPayloadDigest: string;
}

export const defaultMhsV2SuccessorLocalPreparationPaths = (root = process.cwd()): MhsV2SuccessorLocalPreparationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
  const cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  const firstOutput = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1");
  return {
    strategy: path.join(mhs, "training/mhs-v2-successor-training-strategy-analysis-v1.json"), contract: path.join(mhs, "training/mhs-v2-successor-training-contract-v1.json"),
    environment: path.join(mhs, "training/mhs-v2-training-environment-authority-v1.json"), train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"), projection: path.join(mhs, "development/mhs-development-text-projection-v2.jsonl"),
    runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py"), model: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_model.py"),
    baseWeights: path.join(cache, "model.safetensors"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerBinding: path.join(firstOutput, "final/tokenizer-binding.json"), outputRoot: path.resolve(root, OUTPUT_ROOT),
  };
};

const exact = (filename: string, expected: string, label: string): void => {
  if (!fs.existsSync(filename) || sha256(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-8E-C ${label} authority mismatch`);
};

export const createMhsV2SuccessorLocalPreparation = (
  paths: MhsV2SuccessorLocalPreparationPaths,
  evidence: { readonly preflightPassed: true; readonly selfTestPassed: true; readonly pythonTestsPassed: true },
): MhsV2SuccessorLocalPreparationArtifact => {
  exact(paths.strategy, MHS_V2_SUCCESSOR_STRATEGY_SHA256, "strategy"); exact(paths.contract, MHS_V2_SUCCESSOR_CONTRACT_SHA256, "contract"); exact(paths.environment, ENVIRONMENT_SHA, "environment");
  exact(paths.train, TRAIN_SHA, "TRAIN"); exact(paths.validation, VALIDATION_SHA, "VALIDATION"); exact(paths.projection, PROJECTION_SHA, "development projection");
  exact(paths.runner, MHS_V2_SUCCESSOR_RUNNER_SHA256, "runner"); exact(paths.model, MHS_V2_SUCCESSOR_MODEL_SHA256, "model implementation"); exact(paths.baseWeights, BASE_WEIGHT_SHA, "base weights"); exact(paths.tokenizer, TOKENIZER_SHA, "tokenizer"); exact(paths.tokenizerBinding, TOKENIZER_BINDING_SHA, "tokenizer binding");
  if (fs.existsSync(paths.outputRoot)) throw new Error("T6L-8E-C real successor output root must remain absent");
  const strategy = JSON.parse(fs.readFileSync(paths.strategy, "utf8")) as Record<string, unknown>, contract = JSON.parse(fs.readFileSync(paths.contract, "utf8")) as Record<string, unknown>;
  validateMhsV2SuccessorStrategy(strategy); validateMhsV2SuccessorContract(contract);
  const runnerSource = fs.readFileSync(paths.runner, "utf8"), modelSource = fs.readFileSync(paths.model, "utf8");
  const ramGate = /(?:available|total)(?:Ram|Memory|_ram|_memory|RamBytes|MemoryBytes)\s*[<>=]|virtual_memory\(\)\.(?:available|total)\s*[<>=]|\b(?:GiB|GB-class)\b/iu;
  if (ramGate.test(runnerSource) || !/"authoritativeForEligibility": False/u.test(runnerSource)) throw new Error("T6L-8E-C RAM eligibility policy mismatch");
  if (!/--preflight/u.test(runnerSource) || !/--self-test/u.test(runnerSource) || !/--execute-authorized-local-run/u.test(runnerSource) || /add_argument\(["']--(?:train|validation|dataset|model|revision|epochs|learning-rate|batch|output)/u.test(runnerSource)) throw new Error("T6L-8E-C bounded CLI mismatch");
  if (!/XLMRobertaClassificationHead/u.test(modelSource) || !/auxiliary_logits\.sum\(\) \* 0\.0/u.test(modelSource) || !/binary_loss \+ AUXILIARY_WEIGHT \* auxiliary_loss/u.test(modelSource)) throw new Error("T6L-8E-C model or masked loss mismatch");
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SCHEMA, preparationVersion: MHS_V2_SUCCESSOR_LOCAL_PREPARATION_VERSION, phase: "T6L-8E-C" as const, status: "LOCAL_SUCCESSOR_TRAINING_READY" as const,
    authorities: { strategy: { sha256: MHS_V2_SUCCESSOR_STRATEGY_SHA256, payloadDigest: MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST }, successorTrainingContract: { sha256: MHS_V2_SUCCESSOR_CONTRACT_SHA256, payloadDigest: MHS_V2_SUCCESSOR_CONTRACT_PAYLOAD_DIGEST }, train: { sha256: TRAIN_SHA, payloadDigest: TRAIN_PAYLOAD, rows: 200, ALLOW: 110, BLOCK: 90 }, validation: { sha256: VALIDATION_SHA, payloadDigest: VALIDATION_PAYLOAD, rows: 13, ALLOW: 9, BLOCK: 4 }, developmentProjection: { sha256: PROJECTION_SHA, payloadDigest: PROJECTION_PAYLOAD, rows: 213 }, environmentSha256: ENVIRONMENT_SHA, baseModel: { repository: "FacebookAI/xlm-roberta-base", revision: "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", weightSha256: BASE_WEIGHT_SHA, source: "ORIGINAL_PINNED_BASE_NOT_FIRST_CANDIDATE" }, tokenizer: { implementation: "XLMRobertaTokenizerFast", sha256: TOKENIZER_SHA, bindingSha256: TOKENIZER_BINDING_SHA } },
    implementation: { runner: { relativePath: "src/research/textModerationDataset/training/run_mhs_v2_successor_local_training.py", sha256: MHS_V2_SUCCESSOR_RUNNER_SHA256, modes: ["--preflight", "--self-test", "--execute-authorized-local-run"] }, model: { relativePath: "src/research/textModerationDataset/training/mhs_v2_successor_model.py", sha256: MHS_V2_SUCCESSOR_MODEL_SHA256, encoder: "XLMRobertaModel_STANDARD_FIRST_TOKEN_SEQUENCE_CLASSIFICATION_REPRESENTATION", binaryHead: "XLMRobertaClassificationHead_TWO_LOGITS", auxiliaryHead: "XLMRobertaClassificationHead_FIVE_LOGITS", initializer: "NORMAL_STD_0_02_ZERO_BIAS_AFTER_FROZEN_SEED" }, futureUserCommand: "npm run train:text-moderation:mhs-v2-successor-local", arbitraryOverridesAccepted: false },
    configuration: { principalExperimentalVariable: "ADD_MASKED_AUXILIARY_BLOCK_CATEGORY_CROSS_ENTROPY", maxLength: 160, padding: "DYNAMIC_RIGHT", truncation: "DETERMINISTIC_RIGHT", trainBatchSize: 8, validationBatchSize: 8, gradientAccumulation: 1, effectiveBatchSize: 8, optimizer: "ADAMW_TORCH", learningRate: 2e-5, betas: [0.9, 0.999], epsilon: 1e-8, weightDecay: 0.01, epochs: 3, batchesPerEpoch: 25, optimizerSteps: 75, schedulerSteps: 75, validationEvaluations: 3, scheduler: "LINEAR_DECAY", warmupSteps: 2, maxGradientNorm: 1, precision: "FP32", seedString: "STHN_T6L_8E_B_MHS_V2_SUCCESSOR_CATEGORY_AWARE_TRAINING_RUN_V1", seedInteger: 926509953, workers: 0, sampling: "NATURAL_SEEDED_RANDOM_WITHOUT_REPLACEMENT", outputRoot: OUTPUT_ROOT, productionThresholdStatus: "NOT_SELECTED" },
    categoryAuthority: { joinKey: "exampleId", corroboration: ["candidateTextDigest", "decision", "primaryCategory", "split", "origin"], rawTextEqualityAuthoritative: false, category2id: { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 2, SEXUAL: 3, THREAT_OR_VIOLENCE: 4 }, otherInappropriateIncluded: false, train: { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 }, validation: { ABUSIVE_OR_HARASSING: 0, HATE: 1, PROFANITY: 1, SEXUAL: 1, THREAT_OR_VIOLENCE: 1 } },
    objectives: { primary: { loss: "TWO_LOGIT_CROSS_ENTROPY", appliesTo: "ALL_ROWS", weight: 1 }, auxiliary: { loss: "MASKED_FIVE_LOGIT_CROSS_ENTROPY", eligible: "BLOCK_WITH_SUPPORTED_AUTHORITATIVE_CATEGORY", zeroEligibleBatch: "DIFFERENTIABLE_ZERO_NO_EMPTY_CROSS_ENTROPY", weight: 0.25, authority: "DIAGNOSTIC_ONLY_EXCEPT_TRAINING_LOSS" }, total: "BINARY_CE_PLUS_0_25_TIMES_MASKED_AUXILIARY_CE" },
    checkpointing: { cadence: "ONCE_PER_EPOCH", planned: 3, maximumRetained: 2, format: "SAFETENSORS", selection: ["HIGHEST_VALIDATION_BINARY_MACRO_F1", "LOWEST_VALIDATION_BINARY_LOSS", "EARLIEST_EPOCH"], auxiliaryMetricsSelectionAuthority: false, selectedCheckpointPreserved: true, finalWeightsMustEqualSelectedCheckpoint: true },
    lifecycle: { states: ["RUNNING", "COMPLETED", "FAILED", "INTERRUPTED"], durable: true, completionRetractedOnLateFailure: true, overwriteRefused: true, resumeAllowed: false },
    resourcePolicy: { device: "CPU_REQUIRED", gpuAuthorized: false, precision: "FP32", minimumAvailableRamBytes: null, minimumTotalRamBytes: null, percentageFreeMemoryGate: null, fixedGbGate: null, ramDiagnosticsAuthoritative: false, ramAffectsEligibility: false, resourceDiagnostics: { authoritativeForEligibility: false } },
    verification: { preflightPassed: evidence.preflightPassed, syntheticSelfTestPassed: evidence.selfTestPassed, pythonTestsPassed: evidence.pythonTestsPassed, pythonSyntaxValid: true, outputRootAbsent: true, modelLoads: 0, forwardPasses: 0, trainingRuns: 0 },
    boundaries: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, protectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0, productionChanges: 0, realOutputsCreated: 0 }, preparedAt: MHS_V2_SUCCESSOR_LOCAL_PREPARED_AT,
  };
  const artifact: MhsV2SuccessorLocalPreparationArtifact = { ...payload, preparationPayloadDigest: digest(payload) };
  validateMhsV2SuccessorLocalPreparation(artifact); return artifact;
};

export const validateMhsV2SuccessorLocalPreparation = (artifact: MhsV2SuccessorLocalPreparationArtifact): void => {
  const { preparationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SCHEMA || artifact.preparationVersion !== MHS_V2_SUCCESSOR_LOCAL_PREPARATION_VERSION || artifact.phase !== "T6L-8E-C" || artifact.status !== "LOCAL_SUCCESSOR_TRAINING_READY" || preparationPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8E-C identity or payload");
  if (MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST && preparationPayloadDigest !== MHS_V2_SUCCESSOR_LOCAL_PREPARATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8E-C pinned payload");
  if (MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_SUCCESSOR_LOCAL_PREPARATION_SHA256) throw new Error("Invalid T6L-8E-C pinned artifact");
  const configuration = artifact.configuration, resources = artifact.resourcePolicy;
  if (configuration.productionThresholdStatus !== "NOT_SELECTED" || configuration.seedInteger !== 926509953 || configuration.optimizerSteps !== 75 || resources.ramAffectsEligibility !== false || resources.minimumAvailableRamBytes !== null || resources.minimumTotalRamBytes !== null || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8E-C configuration, resource policy, or boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorLocalPreparation = (artifact: MhsV2SuccessorLocalPreparationArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorLocalPreparation(artifact); fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_LOCAL_PREPARATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8E-C preparation exists; overwrite refused");
  const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8E-C publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
