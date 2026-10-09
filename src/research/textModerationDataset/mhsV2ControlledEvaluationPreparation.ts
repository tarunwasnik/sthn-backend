import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256,
  MHS_V2_CONTROLLED_EVALUATION_OUTPUT_ROOT,
  validateMhsV2ControlledEvaluationContract,
} from "./mhsV2ControlledEvaluationContract";
import {
  MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256,
} from "./mhsV2FirstLocalTrainingCertification";

export const MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_CONTROLLED_EVALUATION_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_PREPARATION_VERSION = "MHS_V2_CONTROLLED_EVALUATION_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_PREPARATION_FILENAME = "mhs-v2-controlled-evaluation-runner-preparation-v1.json" as const;
export const MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256 = "c556636683ca8fa055cdd3507f0253ebd3f6067876b4a4b66d288093fa44a08d";
export const MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST = "09737425a488bd242ca4b30ec2a624f6e5f2dcaf0946f2e747d8f3f089bbf41e";
export const MHS_V2_CONTROLLED_EVALUATION_RUNNER_SHA256 = "8a8d35298d6ead77b725935af1562dfe9118e6c1c06b514d5a77ed6ef4e1efc0";
export const MHS_V2_CONTROLLED_EVALUATION_SOURCE_BRIDGE_SHA256 = "dd6f90fc0e4ff224faf417636108df4a1c591aff7448bfbea125c642c5359525";
export const MHS_V2_CONTROLLED_EVALUATION_PREPARED_AT = "2026-09-29T12:00:00.000Z" as const;

const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const INTERNAL_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));

export interface MhsV2ControlledEvaluationPreparationPaths {
  readonly contract: string; readonly certification: string; readonly runner: string; readonly sourceBridge: string;
  readonly finalModel: string; readonly tokenizer: string; readonly tokenizerBinding: string; readonly internalFreeze: string; readonly benchmarkSource: string;
}
export interface MhsV2ControlledEvaluationPreparationArtifact {
  readonly schemaVersion: typeof MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SCHEMA; readonly preparationVersion: typeof MHS_V2_CONTROLLED_EVALUATION_PREPARATION_VERSION;
  readonly phase: "T6L-8D-B"; readonly status: "LOCAL_CONTROLLED_EVALUATION_READY"; readonly authorities: Readonly<Record<string, unknown>>;
  readonly runner: Readonly<Record<string, unknown>>; readonly protectedSources: Readonly<Record<string, unknown>>; readonly configuration: Readonly<Record<string, unknown>>;
  readonly metrics: readonly string[]; readonly privacy: Readonly<Record<string, unknown>>; readonly lifecycle: Readonly<Record<string, unknown>>;
  readonly resourcePolicy: Readonly<Record<string, unknown>>; readonly structuralVerification: Readonly<Record<string, unknown>>; readonly boundaries: Readonly<Record<string, unknown>>;
  readonly preparedAt: typeof MHS_V2_CONTROLLED_EVALUATION_PREPARED_AT; readonly preparationPayloadDigest: string;
}

export const defaultMhsV2ControlledEvaluationPreparationPaths = (root = process.cwd()): MhsV2ControlledEvaluationPreparationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), trainingRun = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"), cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  return { contract: path.join(mhs, "training/mhs-v2-controlled-evaluation-contract-v1.json"), certification: path.join(mhs, "training/mhs-v2-first-local-training-run-certification-v1.json"), runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_controlled_evaluation.py"), sourceBridge: path.resolve(root, "src/scripts/readMhsV2ProtectedEvaluationSource.ts"), finalModel: path.join(trainingRun, "final/model.safetensors"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerBinding: path.join(trainingRun, "final/tokenizer-binding.json"), internalFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), benchmarkSource: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts") };
};

const exact = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-8D-B ${label} authority mismatch`); };
export const createMhsV2ControlledEvaluationPreparation = (paths: MhsV2ControlledEvaluationPreparationPaths, evidence: { readonly preflightPassed: true; readonly selfTestPassed: true }): MhsV2ControlledEvaluationPreparationArtifact => {
  exact(paths.contract, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, "8D-A contract"); exact(paths.certification, MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256, "8C3 certification"); exact(paths.finalModel, MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, "candidate"); exact(paths.tokenizer, TOKENIZER_SHA, "tokenizer"); exact(paths.tokenizerBinding, TOKENIZER_BINDING_SHA, "tokenizer binding"); exact(paths.internalFreeze, INTERNAL_FREEZE_SHA, "INTERNAL_TEST freeze"); exact(paths.benchmarkSource, BENCHMARK_SHA, "benchmark");
  const contract = JSON.parse(fs.readFileSync(paths.contract, "utf8")); validateMhsV2ControlledEvaluationContract(contract);
  const runnerSha = sha256(fs.readFileSync(paths.runner)), bridgeSha = sha256(fs.readFileSync(paths.sourceBridge)), runnerSource = fs.readFileSync(paths.runner, "utf8"), bridgeSource = fs.readFileSync(paths.sourceBridge, "utf8");
  if ((MHS_V2_CONTROLLED_EVALUATION_RUNNER_SHA256 && runnerSha !== MHS_V2_CONTROLLED_EVALUATION_RUNNER_SHA256) || (MHS_V2_CONTROLLED_EVALUATION_SOURCE_BRIDGE_SHA256 && bridgeSha !== MHS_V2_CONTROLLED_EVALUATION_SOURCE_BRIDGE_SHA256)) throw new Error("T6L-8D-B runner source mismatch");
  const forbiddenRamGate = /virtual_memory|psutil|(?:available|total|free)(?:Ram|Memory|_ram|_memory|RamBytes|MemoryBytes)\s*[<>=]|(?:ram|memory)(?:Bytes|_bytes)\s*[<>=]|\bGiB\b|\bGB-class\b/iu;
  if (forbiddenRamGate.test(runnerSource)) throw new Error("T6L-8D-B RAM eligibility gate is prohibited");
  if (!/--preflight/u.test(runnerSource) || !/--self-test/u.test(runnerSource) || !/--execute-authorized-local-evaluation/u.test(runnerSource) || /(?:import|require).{0,80}textModerationFixtures/iu.test(runnerSource) || !/require\("\.\.\/\.\.\/evaluation\/textModeration\/textModerationFixtures"\)/u.test(fs.readFileSync(path.resolve(path.dirname(paths.sourceBridge), "../research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts"), "utf8")) || /textModerationFixtures/u.test(bridgeSource)) throw new Error("T6L-8D-B runner or lazy protected-source boundary mismatch");
  const payload = { schemaVersion: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SCHEMA, preparationVersion: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_VERSION, phase: "T6L-8D-B" as const, status: "LOCAL_CONTROLLED_EVALUATION_READY" as const,
    authorities: { controlledEvaluationContractSha256: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, controlledEvaluationContractPayloadDigest: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST, trainingCertificationSha256: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_SHA256, trainingCertificationPayloadDigest: MHS_V2_FIRST_LOCAL_TRAINING_CERTIFICATION_PAYLOAD_DIGEST, candidateSha256: MHS_V2_FIRST_LOCAL_SELECTED_MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA, tokenizerBindingSha256: TOKENIZER_BINDING_SHA, internalTestFreezeSha256: INTERNAL_FREEZE_SHA, internalTestMembershipDigest: INTERNAL_MEMBERSHIP, externalBenchmarkVersion: "STHN_TEXT_MODERATION_FIXTURES_V1R", externalBenchmarkSha256: BENCHMARK_SHA },
    runner: { relativePath: "src/research/textModerationDataset/training/run_mhs_v2_controlled_evaluation.py", sha256: runnerSha, sourceBridgeRelativePath: "src/scripts/readMhsV2ProtectedEvaluationSource.ts", sourceBridgeSha256: bridgeSha, modes: ["--preflight", "--self-test", "--execute-authorized-local-evaluation"], arbitraryOverridesAccepted: false, futureUserCommand: "npm run evaluate:text-moderation:mhs-v2-local" },
    protectedSources: { loading: "LAZY_AFTER_LIFECYCLE_AND_DURABLE_EXPOSURE_EVENT", internalTest: { count: 13, ALLOW: 9, BLOCK: 4 }, externalBenchmark: { count: 140 }, reserveAuthorized: false, exclusionAuthorized: false, importTimeLoading: false, preflightRawLoading: false, selfTestRawLoading: false },
    configuration: { device: "CPU", precision: "FP32", batchSize: 8, maxLength: 160, labels: { ALLOW: 0, BLOCK: 1 }, evaluationDecisionRule: "ARGMAX_TWO_LOGITS", implementationRule: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", tieRule: "LOWEST_LABEL_INDEX_ALLOW", productionThresholdStatus: "NOT_SELECTED", modelEval: true, gradients: false, shuffle: false, optimizer: null, scheduler: null, network: false, environment: { python: "3.12.10", torch: "2.3.1+cpu", transformers: "4.42.4", tokenizers: "0.19.1", sentencepiece: "0.2.0", safetensors: "0.4.3", numpy: "1.26.4" }, outputRoot: MHS_V2_CONTROLLED_EVALUATION_OUTPUT_ROOT },
    metrics: ["COUNT", "GROUND_TRUTH_COUNTS", "PREDICTED_COUNTS", "CONFUSION_MATRIX", "ACCURACY", "ALLOW_PRECISION", "ALLOW_RECALL", "ALLOW_F1", "BLOCK_PRECISION", "BLOCK_RECALL", "BLOCK_F1", "MACRO_F1", "BALANCED_ACCURACY"],
    privacy: { rawProtectedTextPersisted: false, perExampleFields: ["source", "exampleId", "textSha256", "trueDecision", "trueTarget", "predictedDecision", "predictedTarget", "allowLogit", "blockLogit", "allowScore", "blockScore", "correct", "truncated", "metadata"], exposureLedgerContainsRawText: false, sourcePipeIsTransient: true },
    lifecycle: { states: ["RUNNING", "FAILED", "INTERRUPTED", "COMPLETED"], exposureLedger: "run/protected-exposure-ledger.jsonl", appendOnlyExposureEvents: ["INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"], completionRequiresBothSources: true, priorExposureCannotBeErased: true, retryRequiresNewVersionedAuthority: true, overwriteRefused: true },
    resourcePolicy: { minimumAvailableRamBytes: null, minimumTotalRamBytes: null, percentageFreeMemoryGate: null, fixedGbGate: null, ramDiagnosticsAuthoritative: false, ramAffectsEligibility: false, actualAllocationFailureDisposition: "FAILED_WITH_LIFECYCLE_AND_EXPOSURE_PRESERVED", arbitraryDiskThreshold: null },
    structuralVerification: { metadataPreflightPassed: evidence.preflightPassed, syntheticSelfTestPassed: evidence.selfTestPassed, runnerSyntaxValid: true, lazyProtectedLoadingVerified: true, outputRootUnused: true },
    boundaries: { realModelLoads: 0, realForwardPasses: 0, protectedInference: 0, protectedRawAccesses: 0, internalTestExposures: 0, benchmarkExposures: 0, trainingRuns: 0, thresholdSelections: 0, productionChanges: 0, evaluationOutputsCreated: 0 }, preparedAt: MHS_V2_CONTROLLED_EVALUATION_PREPARED_AT };
  const artifact: MhsV2ControlledEvaluationPreparationArtifact = { ...payload, preparationPayloadDigest: digest(payload) }; validateMhsV2ControlledEvaluationPreparation(artifact); return artifact;
};

export const validateMhsV2ControlledEvaluationPreparation = (artifact: MhsV2ControlledEvaluationPreparationArtifact): void => {
  const { preparationPayloadDigest, ...payload } = artifact; const config = artifact.configuration as Record<string, unknown>, resources = artifact.resourcePolicy as Record<string, unknown>;
  if (artifact.schemaVersion !== MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SCHEMA || artifact.preparationVersion !== MHS_V2_CONTROLLED_EVALUATION_PREPARATION_VERSION || artifact.phase !== "T6L-8D-B" || artifact.status !== "LOCAL_CONTROLLED_EVALUATION_READY" || preparationPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8D-B identity or canonical payload");
  if (MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST && preparationPayloadDigest !== MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8D-B pinned payload");
  if (MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256) throw new Error("Invalid T6L-8D-B pinned artifact");
  if (config.device !== "CPU" || config.precision !== "FP32" || config.batchSize !== 8 || config.maxLength !== 160 || config.productionThresholdStatus !== "NOT_SELECTED" || config.evaluationDecisionRule !== "ARGMAX_TWO_LOGITS" || resources.ramAffectsEligibility !== false || resources.minimumAvailableRamBytes !== null || resources.minimumTotalRamBytes !== null || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8D-B configuration, resource policy, or boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2ControlledEvaluationPreparation = (artifact: MhsV2ControlledEvaluationPreparationArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2ControlledEvaluationPreparation(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8D-B preparation exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8D-B publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
