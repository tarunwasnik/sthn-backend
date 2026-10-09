import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256,
  MHS_V2_FIRST_LOCAL_RUN_MANIFEST_PAYLOAD_DIGEST,
  MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256,
  MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256,
} from "./mhsV2FirstLocalTrainingCertification";

export const MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_CONTROLLED_EVALUATION_CONTRACT_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CONTRACT_VERSION = "MHS_V2_CONTROLLED_EVALUATION_CONTRACT_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CONTRACT_FILENAME = "mhs-v2-controlled-evaluation-contract-v1.json" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256 = "1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e";
export const MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST = "9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b";
export const MHS_V2_CONTROLLED_EVALUATION_FROZEN_AT = "2026-09-29T00:00:00.000Z" as const;
export const MHS_V2_CONTROLLED_EVALUATION_OUTPUT_ROOT = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1" as const;

const INTERNAL_TEST_FREEZE_SHA256 = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST = "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb";
const INTERNAL_TEST_MEMBERSHIP_DIGEST = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13";
const BENCHMARK_VERSION = "STHN_TEXT_MODERATION_FIXTURES_V1R";
const BENCHMARK_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const FINAL_CONFIG_SHA256 = "d6bb338e29a8273be512a372b5e08071aac1b736239234861952bbbecc294308";
const TOKENIZER_BINDING_SHA256 = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const ENVIRONMENT_SHA256 = "3db1643fe6d65b1b0725751dde56088a70317ae9ae60bc83b5c7a880af85a9d8";
const ENVIRONMENT_PAYLOAD_DIGEST = "3bf378d5d0c44089de38be4e17b774a3ebb80adcbf6b1c8a2bad274a516ba52d";
const TRAINING_CONTRACT_SHA256 = "df28bb1443a19baff12318b44f3da4abbe1d4492b73ab7b63a4221a9b5d645a9";
const TRAINING_CONTRACT_PAYLOAD_DIGEST = "9ef954a82382daf971c1d2cfe8e91cf5fdfb4e3ab18a511ffa85b8e6eb6e3c6e";

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
export const sha256EvaluationFile = (filename: string): string => {
  const hash = crypto.createHash("sha256"), descriptor = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try { let count = 0; do { count = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (count) hash.update(buffer.subarray(0, count)); } while (count); }
  finally { fs.closeSync(descriptor); }
  return hash.digest("hex");
};

export interface MhsV2ControlledEvaluationContractPaths {
  readonly certification: string; readonly runManifest: string; readonly resultSummary: string;
  readonly finalModel: string; readonly finalConfig: string; readonly tokenizerBinding: string;
  readonly internalTestFreeze: string; readonly environment: string; readonly trainingContract: string;
}

export interface MhsV2ControlledEvaluationContractArtifact {
  readonly schemaVersion: typeof MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SCHEMA;
  readonly contractVersion: typeof MHS_V2_CONTROLLED_EVALUATION_CONTRACT_VERSION;
  readonly phase: "T6L-8D-A"; readonly status: "CONTROLLED_EVALUATION_CONTRACT_READY";
  readonly candidate: Readonly<Record<string, unknown>>;
  readonly authorities: Readonly<Record<string, unknown>>;
  readonly preprocessing: Readonly<Record<string, unknown>>;
  readonly execution: Readonly<Record<string, unknown>>;
  readonly stages: readonly Readonly<Record<string, unknown>>[];
  readonly decisionAndScores: Readonly<Record<string, unknown>>;
  readonly perExampleOutput: Readonly<Record<string, unknown>>;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly output: Readonly<Record<string, unknown>>;
  readonly failurePolicy: Readonly<Record<string, unknown>>;
  readonly interpretation: Readonly<Record<string, unknown>>;
  readonly lifecycle: Readonly<Record<string, unknown>>;
  readonly boundaries: Readonly<Record<string, unknown>>;
  readonly frozenAt: typeof MHS_V2_CONTROLLED_EVALUATION_FROZEN_AT;
  readonly contractPayloadDigest: string;
}

export const defaultMhsV2ControlledEvaluationContractPaths = (root = process.cwd()): MhsV2ControlledEvaluationContractPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
  const run = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1");
  return {
    certification: path.join(mhs, "training/mhs-v2-first-local-training-run-certification-v1.json"),
    runManifest: path.join(run, "run/run-manifest.json"), resultSummary: path.join(run, "run/result-summary.json"),
    finalModel: path.join(run, "final/model.safetensors"), finalConfig: path.join(run, "final/config.json"),
    tokenizerBinding: path.join(run, "final/tokenizer-binding.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
    environment: path.join(mhs, "training/mhs-v2-training-environment-authority-v1.json"),
    trainingContract: path.join(mhs, "training/mhs-v2-xlm-roberta-training-contract-v1.json"),
  };
};

const assertSha = (filename: string, expected: string, label: string): void => {
  if (sha256EvaluationFile(filename) !== expected) throw new Error(`T6L-8D-A ${label} SHA-256 mismatch`);
};

export const createMhsV2ControlledEvaluationContract = (paths: MhsV2ControlledEvaluationContractPaths): MhsV2ControlledEvaluationContractArtifact => {
  assertSha(paths.certification, MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256, "8C3 certification");
  assertSha(paths.runManifest, MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, "run manifest");
  assertSha(paths.resultSummary, MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256, "result summary");
  assertSha(paths.finalModel, MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, "selected final model");
  assertSha(paths.finalConfig, FINAL_CONFIG_SHA256, "final config");
  assertSha(paths.tokenizerBinding, TOKENIZER_BINDING_SHA256, "tokenizer binding");
  assertSha(paths.internalTestFreeze, INTERNAL_TEST_FREEZE_SHA256, "INTERNAL_TEST freeze metadata");
  assertSha(paths.environment, ENVIRONMENT_SHA256, "environment authority");
  assertSha(paths.trainingContract, TRAINING_CONTRACT_SHA256, "training contract");

  const payload = {
    schemaVersion: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SCHEMA, contractVersion: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_VERSION,
    phase: "T6L-8D-A" as const, status: "CONTROLLED_EVALUATION_CONTRACT_READY" as const,
    candidate: {
      identity: "MHS_V2_XLM_ROBERTA_FIRST_LOCAL_RUN_SELECTED_EPOCH_03", architecture: "XLMRobertaForSequenceClassification",
      labels: { "0": "ALLOW", "1": "BLOCK" }, selectedEpoch: 3, selectedCheckpoint: "checkpoints/checkpoint-epoch-03",
      finalModelRelativePath: "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1/final/model.safetensors",
      finalModelSha256: MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, finalConfigSha256: FINAL_CONFIG_SHA256,
      tokenizerBindingSha256: TOKENIZER_BINDING_SHA256, eligibleForEvaluationOnly: true, productionReady: false,
    },
    authorities: {
      trainingCertification: { sha256: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256, payloadDigest: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST },
      runManifest: { sha256: MHS_V2_FIRST_LOCAL_RUN_MANIFEST_SHA256, payloadDigest: MHS_V2_FIRST_LOCAL_RUN_MANIFEST_PAYLOAD_DIGEST },
      resultSummary: { sha256: MHS_V2_FIRST_LOCAL_RESULT_SUMMARY_SHA256 },
      environment: { sha256: ENVIRONMENT_SHA256, payloadDigest: ENVIRONMENT_PAYLOAD_DIGEST },
      trainingContract: { sha256: TRAINING_CONTRACT_SHA256, payloadDigest: TRAINING_CONTRACT_PAYLOAD_DIGEST },
      internalTest: { version: "MHS_INTERNAL_TEST_FREEZE_V1", sha256: INTERNAL_TEST_FREEZE_SHA256, payloadDigest: INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST, membershipDigest: INTERNAL_TEST_MEMBERSHIP_DIGEST, count: 13, decisionCounts: { ALLOW: 9, BLOCK: 4 } },
      externalBenchmark: { version: BENCHMARK_VERSION, sha256: BENCHMARK_SHA256, count: 140 },
      prohibitedPopulations: { reserveCount: 256, exclusionCount: 4, authorizedForEvaluation: false },
    },
    preprocessing: {
      source: "INHERITED_EXACTLY_FROM_T6L_8B_TRAINING_CONTRACT", exactUnicode: true, lowercase: false, translation: false,
      transliteration: false, censorship: false, punctuationStripping: false, semanticNormalization: false,
      tokenizer: "XLMRobertaTokenizerFast", addSpecialTokens: true, tokenTypeIds: false, maxLength: 160,
      truncation: "RIGHT", padding: "DYNAMIC_LONGEST_IN_BATCH", paddingSide: "RIGHT", persistentTokenizedDataset: false,
    },
    execution: {
      device: "CPU", precision: "FP32", evaluationMode: true, gradientTracking: false, shuffle: false, batchSize: 8,
      deterministicOrder: "SOURCE_DEFINED_STABLE_ORDER", networkDuringRun: false, modelOrTokenizerOverrides: false,
      environment: { python: "3.12.10", torch: "2.3.1+cpu", transformers: "4.42.4", tokenizers: "0.19.1", sentencepiece: "0.2.0", safetensors: "0.4.3", numpy: "1.26.4" },
    },
    stages: [
      { order: 1, id: "CANDIDATE_INTEGRITY_PREFLIGHT", rawProtectedContentAccess: false, requirements: ["ALL_AUTHORITY_HASHES_MATCH", "FINAL_MODEL_CONFIG_AND_TOKENIZER_BINDING_MATCH", "OUTPUT_ROOT_MUST_NOT_EXIST", "PINNED_ENVIRONMENT_MATCHES"] },
      { order: 2, id: "INTERNAL_TEST_EVALUATION", sourceCount: 13, explicitAccessPurpose: "FINAL_INTERNAL_EVALUATION_ACCESS", thresholdSelectionPermitted: false, outputsSealedBeforeNextStage: true },
      { order: 3, id: "EXTERNAL_BENCHMARK_EVALUATION", sourceVersion: BENCHMARK_VERSION, sourceCount: 140, thresholdSelectionPermitted: false, priorSourceOutcomesMayAlterExecution: false },
      { order: 4, id: "COMBINED_ANALYSIS", mergesPopulations: false, independentSourceMetricsPreserved: true, aggregateAcrossSourcesAuthoritative: false },
      { order: 5, id: "LATER_DECISION", executedInThisContractPhase: false, thresholdSelectionPermitted: false, productionDecisionPermitted: false },
    ],
    decisionAndScores: {
      rule: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", tieRule: "LOWEST_LABEL_INDEX_ALLOW", productionThresholdStatus: "NOT_SELECTED",
      thresholdSearch: false, thresholdTuning: false, sourceSpecificDecisionRules: false,
      scores: { computation: "DETERMINISTIC_SOFTMAX_OF_TWO_LOGITS", names: ["ALLOW_SCORE", "BLOCK_SCORE"], calibratedConfidence: false, termConfidenceProhibited: true },
      numericSerialization: "FINITE_IEEE_754_JSON_NUMBER_WITHOUT_CONTRACTUAL_ROUNDING",
    },
    perExampleOutput: {
      rawTextIncluded: false, requiredFields: ["source", "exampleId", "textSha256", "trueDecision", "trueTarget", "predictedDecision", "predictedTarget", "allowLogit", "blockLogit", "allowScore", "blockScore", "correct"],
      optionalBoundedMetadataBySource: { INTERNAL_TEST: ["primaryCategory", "language", "script"], EXTERNAL_BENCHMARK: ["domain", "target", "difficulty", "language", "tags", "expectedCategory"] },
      forbiddenFields: ["text", "rawText", "trainingEligibility", "reserveMembership", "exclusionReason"],
    },
    metrics: {
      computedIndependentlyFor: ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], labelOrder: ["ALLOW", "BLOCK"], confusionMatrixAxes: { rows: "TRUE_LABEL", columns: "PREDICTED_LABEL" },
      required: ["COUNT", "GROUND_TRUTH_COUNTS", "PREDICTED_COUNTS", "CONFUSION_MATRIX", "ACCURACY", "ALLOW_PRECISION", "ALLOW_RECALL", "ALLOW_F1", "BLOCK_PRECISION", "BLOCK_RECALL", "BLOCK_F1", "MACRO_F1", "BALANCED_ACCURACY"],
      zeroDenominatorRule: "RETURN_ZERO", sourceSpecificBreakdowns: { INTERNAL_TEST: ["PRIMARY_CATEGORY_DIAGNOSTIC_WITH_TINY_DENOMINATOR_WARNING"], EXTERNAL_BENCHMARK: ["DIFFICULTY", "LANGUAGE", "TAG", "EXPECTED_CATEGORY"] },
      combinedAnalysis: { preserveIndependentMetrics: true, pooledQualityMetricProhibited: true, sourceWeightingProhibited: true },
    },
    output: {
      root: MHS_V2_CONTROLLED_EVALUATION_OUTPUT_ROOT, overwritePolicy: "REFUSE_IF_ROOT_EXISTS", partialPublicationPolicy: "FAILED_OR_INTERRUPTED_RUN_NEVER_AUTHORITATIVE",
      lifecyclePath: "run/lifecycle.json", runManifestPath: "run/run-manifest.json", resultSummaryPath: "run/result-summary.json",
      internalTest: { predictionsPath: "internal-test/predictions.jsonl", metricsPath: "internal-test/metrics.json" },
      externalBenchmark: { predictionsPath: "external-benchmark/predictions.jsonl", metricsPath: "external-benchmark/metrics.json" },
      combinedAnalysisPath: "analysis/combined-analysis.json", allArtifactsRequireSha256: true, canonicalJsonForJsonArtifacts: true,
    },
    failurePolicy: {
      failClosedOn: ["AUTHORITY_MISMATCH", "CANDIDATE_HASH_MISMATCH", "ENVIRONMENT_MISMATCH", "SOURCE_COUNT_OR_IDENTITY_MISMATCH", "DUPLICATE_OR_MISSING_EXAMPLE", "NONFINITE_LOGIT_OR_SCORE", "METRIC_RECONCILIATION_FAILURE", "RAW_TEXT_IN_OUTPUT", "OUTPUT_ROOT_EXISTS", "PARTIAL_OR_INTERRUPTED_RUN"],
      partialMetricsAreAuthoritative: false, retryRequiresNewEmptyOutputRoot: true, automaticRepair: false,
    },
    interpretation: {
      internalTestWarning: "INTERNAL_TEST_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE_NO_PASS_FAIL_QUALITY_THRESHOLD",
      qualityPassFailThresholdDefined: false, modelAdequacyCertifiedByThisPhase: false, productionReadinessCertifiedByThisPhase: false,
      noTuningBetweenSources: true, noPostHocDecisionRuleChange: true,
    },
    lifecycle: {
      currentPhase: "T6L-8D-A_CONTRACT_ONLY", nextPhases: ["T6L-8D-B_RUNNER_PREPARATION", "T6L-8D-C_USER_LOCAL_EXECUTION", "T6L-8D-D_RESULT_CERTIFICATION", "T6L-8E_SEPARATELY_AUTHORIZED_DECISION_PHASE"],
      oneWayEvaluationHistory: true, rerunOrReplacementRequiresNewVersionedAuthority: true, exactNextAction: "STOP_AFTER_T6L_8D_A_AWAIT_T6L_8D_B_AUTHORIZATION",
    },
    boundaries: {
      modelLoads: 0, classifierEvaluations: 0, protectedRawTextReads: 0, internalTestRawTextReads: 0, benchmarkRawTextReads: 0,
      reserveReads: 0, exclusionReads: 0, trainingRuns: 0, thresholdSelections: 0, productionChanges: 0, runnerCreated: false,
      resultsCreated: false, modelWeightsChanged: false, productionThresholdStatus: "NOT_SELECTED",
    },
    frozenAt: MHS_V2_CONTROLLED_EVALUATION_FROZEN_AT,
  };
  const artifact: MhsV2ControlledEvaluationContractArtifact = { ...payload, contractPayloadDigest: digest(payload) };
  validateMhsV2ControlledEvaluationContract(artifact);
  return artifact;
};

export const validateMhsV2ControlledEvaluationContract = (artifact: MhsV2ControlledEvaluationContractArtifact): void => {
  const { contractPayloadDigest, ...payload } = artifact;
  const candidate = artifact.candidate as Record<string, unknown>, decision = artifact.decisionAndScores as Record<string, unknown>, interpretation = artifact.interpretation as Record<string, unknown>, boundaries = artifact.boundaries as Record<string, unknown>;
  if (artifact.schemaVersion !== MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SCHEMA || artifact.contractVersion !== MHS_V2_CONTROLLED_EVALUATION_CONTRACT_VERSION || artifact.phase !== "T6L-8D-A" || artifact.status !== "CONTROLLED_EVALUATION_CONTRACT_READY" || contractPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8D-A identity or canonical payload");
  if (MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST && contractPayloadDigest !== MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8D-A pinned payload digest");
  if (MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256) throw new Error("Invalid T6L-8D-A pinned artifact SHA-256");
  if (candidate.finalModelSha256 !== MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256 || candidate.productionReady !== false || decision.rule !== "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT" || decision.productionThresholdStatus !== "NOT_SELECTED") throw new Error("Invalid T6L-8D-A candidate or decision policy");
  if (artifact.stages.map((stage) => stage.id).join("|") !== "CANDIDATE_INTEGRITY_PREFLIGHT|INTERNAL_TEST_EVALUATION|EXTERNAL_BENCHMARK_EVALUATION|COMBINED_ANALYSIS|LATER_DECISION") throw new Error("Invalid T6L-8D-A stage order");
  if (interpretation.qualityPassFailThresholdDefined !== false || interpretation.noTuningBetweenSources !== true || Object.entries(boundaries).some(([key, value]) => key === "productionThresholdStatus" ? value !== "NOT_SELECTED" : typeof value === "boolean" ? value : value !== 0)) throw new Error("Invalid T6L-8D-A boundaries");
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2ControlledEvaluationContract = (artifact: MhsV2ControlledEvaluationContractArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2ControlledEvaluationContract(artifact); fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8D-A contract exists; overwrite refused");
  const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8D-A publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
