import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT,
  validateMhsV2SuccessorReusedEvaluationContract,
} from "./mhsV2SuccessorControlledReusedEvaluationContract";
import {
  MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256,
  validateMhsV2SuccessorEvaluationMethodology,
} from "./mhsV2SuccessorEvaluationMethodology";
import {
  MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_CERTIFICATION_SHA256,
  validateMhsV2SuccessorLocalTrainingCertification,
} from "./mhsV2SuccessorLocalTrainingCertification";
import {
  MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_PROVENANCE_SHA256,
  sha256FileStreaming,
  validateMhsV2SuccessorProvenanceRecovery,
} from "./mhsV2SuccessorTrainingProvenanceRecovery";
import {
  MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_WAIVER_SHA256,
  validateMhsV2SuccessorTrainingProvenanceWaiver,
} from "./mhsV2SuccessorTrainingProvenanceWaiver";

export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_VERSION = "MHS_V2_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION_V1" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_FILENAME = "mhs-v2-successor-local-controlled-reused-evaluation-runner-preparation-v1.json" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SHA256 = "23f5a19a81566ae6b2087fd70b57d1d3140e2d992099523e3d575ae074ebaf25";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_PAYLOAD_DIGEST = "d1da65fa49d118db1362945b01d5e268f3ee8334c72cebb39fd3f8cec37eb3c1";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARED_AT = "2026-09-30T00:00:00.000Z" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_RUNNER_SHA256 = "850effd2e49d74eea0dfe6a233f2bdb84ae1c07bf5caf9b30f60e8d3e1a37ebd";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_METRICS_SHA256 = "4b0598a66c452a7b916794677d8480e8274325ae2420c9fbd33cc61fbe075a46";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_BRIDGE_SHA256 = "04f4e41dd2a1348ad198bd955fcf3200e949f5b7988d10ee2c768c285ab8447f";
export const MHS_V2_SUCCESSOR_MODEL_ADAPTER_SHA256 = "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831";
export const MHS_V2_PROTECTED_SOURCE_LOADER_SHA256 = "1ba59c081550e80b3244a2c558aafcfd60bf0c8bf260787330e82ca2b06e088a";

const MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const CONFIG_SHA = "2f48155190967d11204a0ad87787a179e4ec0d708ac47e8730a1c8ed77f6ec78";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const FINAL_TOKENIZER_BINDING_SHA = "151e78bcd3f3132a49671497baac2f7c8fa0af6808e6572a41b57b1d092a4629";
const INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const FIRST_CERTIFICATION_SHA = "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a";
const FIRST_MANIFEST_SHA = "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718";
const FIRST_INTERNAL_SHA = "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be";
const FIRST_BENCHMARK_SHA = "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const CYCLE_ID = "mhs-v2-successor-reused-protected-evaluation-cycle-v1-51ce8fb5f4cc29a4f6fed21f";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
type Json = Record<string, any>;

export interface MhsV2SuccessorReusedEvaluationPreparationPaths {
  readonly methodology: string; readonly contract: string; readonly certification: string; readonly d0: string; readonly d0w: string;
  readonly model: string; readonly config: string; readonly tokenizer: string; readonly tokenizerBinding: string; readonly finalTokenizerBinding: string;
  readonly internalFreeze: string; readonly firstCertification: string; readonly firstManifest: string; readonly firstInternalPredictions: string; readonly firstBenchmarkPredictions: string;
  readonly runner: string; readonly metricsHelper: string; readonly modelAdapter: string; readonly protectedBridge: string; readonly protectedSourceLoader: string;
}
export interface MhsV2SuccessorReusedEvaluationPreparationArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SCHEMA; readonly preparationVersion: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_VERSION;
  readonly phase: "T6L-8F-C_LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION"; readonly status: "LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_READY";
  readonly authorities: Json; readonly implementation: Json; readonly cycle: Json; readonly runtime: Json; readonly resourcePolicy: Json; readonly preprocessing: Json;
  readonly modelObservation: Json; readonly protectedBoundary: Json; readonly lifecycle: Json; readonly retryAndRecovery: Json; readonly outputs: Json;
  readonly comparison: Json; readonly provenanceSelfAttestation: Json; readonly testEvidence: Json; readonly execution: Json;
  readonly boundaries: Readonly<Record<string, number>>; readonly preparedAt: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARED_AT; readonly preparationPayloadDigest: string;
}

export const defaultMhsV2SuccessorReusedEvaluationPreparationPaths = (root = process.cwd()): MhsV2SuccessorReusedEvaluationPreparationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), evaluation = path.join(mhs, "evaluation"), training = path.join(mhs, "training");
  const successor = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1"), firstTraining = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"), firstEvaluation = path.resolve(root, "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1"), cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  return { methodology: path.join(evaluation, "mhs-v2-successor-evaluation-methodology-v1.json"), contract: path.join(evaluation, "mhs-v2-successor-controlled-reused-evaluation-contract-v1.json"), certification: path.join(training, "mhs-v2-successor-local-training-run-certification-v1.json"), d0: path.join(training, "mhs-v2-successor-training-provenance-recovery-v1.json"), d0w: path.join(training, "mhs-v2-successor-training-provenance-waiver-v1.json"), model: path.join(successor, "final/model.safetensors"), config: path.join(successor, "final/config.json"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerBinding: path.join(firstTraining, "final/tokenizer-binding.json"), finalTokenizerBinding: path.join(successor, "final/tokenizer-binding.json"), internalFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), firstCertification: path.join(training, "mhs-v2-first-controlled-evaluation-certification-v1.json"), firstManifest: path.join(firstEvaluation, "run/run-manifest.json"), firstInternalPredictions: path.join(firstEvaluation, "internal-test/predictions.jsonl"), firstBenchmarkPredictions: path.join(firstEvaluation, "external-benchmark/predictions.jsonl"), runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_successor_reused_evaluation.py"), metricsHelper: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_reused_evaluation_metrics.py"), modelAdapter: path.resolve(root, "src/research/textModerationDataset/training/mhs_v2_successor_model.py"), protectedBridge: path.resolve(root, "src/scripts/readMhsV2SuccessorProtectedEvaluationSource.ts"), protectedSourceLoader: path.resolve(root, "src/research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts") };
};
const read = (filename: string): Json => JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
const exact = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8F-C ${label} SHA mismatch`); };
const same = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8F-C ${label} mismatch`); };

export const createMhsV2SuccessorReusedEvaluationPreparation = (paths: MhsV2SuccessorReusedEvaluationPreparationPaths, evidence: { readonly syntaxCheckPassed: true; readonly syntheticSelfTestPassed: true; readonly protectedFreePreflightPassed: true }): MhsV2SuccessorReusedEvaluationPreparationArtifact => {
  const pinned: readonly [string, string, string][] = [[paths.methodology, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256, "8F-A"], [paths.contract, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256, "8F-B"], [paths.certification, MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, "successor certification"], [paths.d0, MHS_V2_SUCCESSOR_PROVENANCE_SHA256, "D0"], [paths.d0w, MHS_V2_SUCCESSOR_WAIVER_SHA256, "D0W"], [paths.model, MODEL_SHA, "model"], [paths.config, CONFIG_SHA, "config"], [paths.tokenizer, TOKENIZER_SHA, "tokenizer"], [paths.tokenizerBinding, TOKENIZER_BINDING_SHA, "tokenizer binding"], [paths.finalTokenizerBinding, FINAL_TOKENIZER_BINDING_SHA, "final tokenizer binding"], [paths.internalFreeze, INTERNAL_FREEZE_SHA, "INTERNAL_TEST"], [paths.firstCertification, FIRST_CERTIFICATION_SHA, "first certification"], [paths.firstManifest, FIRST_MANIFEST_SHA, "first manifest"], [paths.firstInternalPredictions, FIRST_INTERNAL_SHA, "first internal predictions"], [paths.firstBenchmarkPredictions, FIRST_BENCHMARK_SHA, "first benchmark predictions"], [paths.runner, MHS_V2_SUCCESSOR_REUSED_EVALUATION_RUNNER_SHA256, "runner"], [paths.metricsHelper, MHS_V2_SUCCESSOR_REUSED_EVALUATION_METRICS_SHA256, "metrics helper"], [paths.modelAdapter, MHS_V2_SUCCESSOR_MODEL_ADAPTER_SHA256, "model adapter"], [paths.protectedBridge, MHS_V2_SUCCESSOR_REUSED_EVALUATION_BRIDGE_SHA256, "protected bridge"], [paths.protectedSourceLoader, MHS_V2_PROTECTED_SOURCE_LOADER_SHA256, "protected loader"]];
  pinned.forEach(([filename, hash, label]) => exact(filename, hash, label));
  const methodology = read(paths.methodology), contract = read(paths.contract), certification = read(paths.certification), d0 = read(paths.d0), d0w = read(paths.d0w), freeze = read(paths.internalFreeze);
  validateMhsV2SuccessorEvaluationMethodology(methodology as Parameters<typeof validateMhsV2SuccessorEvaluationMethodology>[0]); validateMhsV2SuccessorReusedEvaluationContract(contract as Parameters<typeof validateMhsV2SuccessorReusedEvaluationContract>[0]); validateMhsV2SuccessorLocalTrainingCertification(certification as Parameters<typeof validateMhsV2SuccessorLocalTrainingCertification>[0]); validateMhsV2SuccessorProvenanceRecovery(d0 as Parameters<typeof validateMhsV2SuccessorProvenanceRecovery>[0]); validateMhsV2SuccessorTrainingProvenanceWaiver(d0w as Parameters<typeof validateMhsV2SuccessorTrainingProvenanceWaiver>[0]);
  same([methodology.methodologyPayloadDigest, contract.contractPayloadDigest, certification.certificationPayloadDigest, d0.recoveryPayloadDigest, d0w.waiverPayloadDigest], [MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST], "payload authorities");
  same([contract.evaluationCycle.id, contract.evaluationCycle.outputRoot, contract.authorities.benchmark.sha256, freeze.candidateCount, freeze.protectedMembershipDigest], [CYCLE_ID, MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT, BENCHMARK_SHA, 13, "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13"], "cycle and protected metadata");
  const runner = fs.readFileSync(paths.runner, "utf8"), metrics = fs.readFileSync(paths.metricsHelper, "utf8"), bridge = fs.readFileSync(paths.protectedBridge, "utf8"), model = fs.readFileSync(paths.modelAdapter, "utf8");
  const forbiddenRamGate = /(?:available|total|free)(?:Ram|Memory|_ram|_memory|RamBytes|MemoryBytes)\s*[<>=]|(?:ram|memory)(?:Bytes|_bytes)\s*[<>=]|\bGiB\b|\bGB-class\b/iu;
  if (forbiddenRamGate.test(runner) || !/--preflight/u.test(runner) || !/--self-test/u.test(runner) || !/--execute-authorized-local-run/u.test(runner) || /textModerationFixtures/u.test(runner) || /textModerationFixtures/u.test(bridge) || !/mhsV2ProtectedEvaluationSources/u.test(bridge) || !/accessStartMustBeDurableBeforeLoaderInvocation/u.test(canonicalJson(contract.exposureSemantics))) throw new Error("T6L-8F-C runner protection boundary mismatch");
  if (!/auxiliary_logits = self\.auxiliary_head/u.test(model) || !/logits=binary_logits/u.test(model) || !/model\(\*\*encoded\)\.logits/u.test(runner) || /auxiliary_logits.*(?:cpu|tolist|numpy|softmax|argmax)/iu.test(runner)) throw new Error("T6L-8F-C auxiliary isolation mismatch");
  if (!/paired_join/u.test(metrics) || !/paired_transitions/u.test(metrics) || !/grouped_comparison/u.test(metrics) || !/DESCRIPTIVE_PAIRED_COMPARISON_ONLY/u.test(runner)) throw new Error("T6L-8F-C comparison implementation mismatch");
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SCHEMA, preparationVersion: MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_VERSION, phase: "T6L-8F-C_LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION" as const, status: "LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_READY" as const,
    authorities: { methodology: { sha256: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256, payloadDigest: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST }, contract: { sha256: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256, payloadDigest: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST }, successorCertification: { sha256: MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, payloadDigest: MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST, status: certification.status }, d0: { sha256: MHS_V2_SUCCESSOR_PROVENANCE_SHA256, payloadDigest: MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST }, d0w: { sha256: MHS_V2_SUCCESSOR_WAIVER_SHA256, payloadDigest: MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST }, successorModelSha256: MODEL_SHA, successorConfigSha256: CONFIG_SHA, tokenizerSha256: TOKENIZER_SHA, tokenizerBindingSha256: TOKENIZER_BINDING_SHA, finalTokenizerBindingSha256: FINAL_TOKENIZER_BINDING_SHA, internalTest: contract.authorities.internalTest, benchmark: contract.authorities.benchmark, firstEvaluationCertificationSha256: FIRST_CERTIFICATION_SHA, firstPredictionEvidence: { runManifestSha256: FIRST_MANIFEST_SHA, internalTestSha256: FIRST_INTERNAL_SHA, internalTestRows: 13, benchmarkSha256: FIRST_BENCHMARK_SHA, benchmarkRows: 140 } },
    implementation: { runner: { relativePath: "src/research/textModerationDataset/training/run_mhs_v2_successor_reused_evaluation.py", sha256: MHS_V2_SUCCESSOR_REUSED_EVALUATION_RUNNER_SHA256 }, metricsHelper: { relativePath: "src/research/textModerationDataset/training/mhs_v2_successor_reused_evaluation_metrics.py", sha256: MHS_V2_SUCCESSOR_REUSED_EVALUATION_METRICS_SHA256 }, modelAdapter: { relativePath: "src/research/textModerationDataset/training/mhs_v2_successor_model.py", sha256: MHS_V2_SUCCESSOR_MODEL_ADAPTER_SHA256 }, protectedBridge: { relativePath: "src/scripts/readMhsV2SuccessorProtectedEvaluationSource.ts", sha256: MHS_V2_SUCCESSOR_REUSED_EVALUATION_BRIDGE_SHA256 }, protectedSourceLoader: { relativePath: "src/research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts", sha256: MHS_V2_PROTECTED_SOURCE_LOADER_SHA256, reusedUnmodified: true } },
    cycle: { id: CYCLE_ID, outputRoot: MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT, sourceOrder: ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], authorizedCyclesBeforeAccess: 1, remainingAfterFirstAccess: 0, outputRootUnusedAtPreparation: true },
    runtime: { device: "CPU", precision: "FP32", modelEval: true, gradients: false, batchSize: 8, workers: 0, gpuAuthorized: false, mixedPrecision: false, optimizer: null, scheduler: null, training: false, environment: { python: "3.12.10", pytorch: "2.3.1+cpu", transformers: "4.42.4", accelerate: "0.31.0", tokenizers: "0.19.1", sentencepiece: "0.2.0", safetensors: "0.4.3", numpy: "1.26.4" } },
    resourcePolicy: { ramEligibilityGate: "NONE", minimumAvailableRamBytes: null, minimumTotalRamBytes: null, percentageThreshold: null, configurableThreshold: false, diagnosticsAuthoritativeForEligibility: false, lowRamWarningMayBlock: false, allocationFailureMayNaturallyFail: true },
    preprocessing: { exactUnicode: true, maxLength: 160, padding: "DYNAMIC_RIGHT", truncation: "DETERMINISTIC_RIGHT", normalization: false, rewriting: false, translation: false, transliteration: false, augmentation: false, mutation: false },
    modelObservation: { binaryOutputOnly: true, auxiliaryComputation: "TRANSIENT_UNOBSERVED_IF_ARCHITECTURALLY_UNAVOIDABLE", auxiliaryObservation: "PROHIBITED", auxiliaryReturned: false, auxiliaryLogged: false, auxiliaryPersisted: false, auxiliaryMetrics: false, auxiliaryDecisionAuthority: false },
    protectedBoundary: { dataPath: "EXISTING_8D_PROTECTED_SOURCE_LOADER_VIA_SUCCESSOR_CYCLE_GUARD_BRIDGE", runnerDirectSourceFileAccess: false, accessStartDurableAndSyncedBeforeBridgeInvocation: true, preflightProtectedAccess: false, selfTestProtectedAccess: false, rawTextLifetime: "TRANSIENT_BRIDGE_TO_TOKENIZER_TO_MODEL_ONLY", rawTextPrintedLoggedPersistedOrIncludedInErrors: false },
    lifecycle: { states: ["RUNNING", "FAILED_PRE_EXPOSURE", "FAILED_POST_EXPOSURE", "INTERRUPTED_POST_EXPOSURE", "COMPLETED"], events: ["EVALUATION_CYCLE_INITIALIZED", "INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED", "EVALUATION_CYCLE_COMPLETED"], completedPublishedLast: true, exposureNeverErased: true },
    retryAndRecovery: { preExposureSameCycleRetry: true, requiresDurableZeroAccessProof: true, postExposureAutomaticRetry: false, postExposureFreshRoot: false, postExposureCycleReset: false, separatelyAuthorizedInPlaceRecoveryRequired: true, reaccessStartedSourceAuthorized: false },
    outputs: { rowSchema: contract.rowLevelOutput.requiredFields.concat(["binaryLogits", "scoreSemantics"]), forbidden: contract.rowLevelOutput.forbiddenFields, sourceArtifacts: ["PREDICTIONS_JSONL", "METRICS_JSON", "PAIRED_COMPARISON_JSON"], finalArtifacts: ["PAIRED_COMPARISON_ANALYSIS", "RESULT_SUMMARY", "RUN_MANIFEST", "COMPLETED_LIFECYCLE"], rawTextIncluded: false, pooledMetric: false, statistics: "DESCRIPTIVE_PAIRED_COMPARISON_ONLY", threshold: "NOT_SELECTED", productionAuthorized: false },
    comparison: { pairedJoinKeys: ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"], exactCompleteOneToOne: true, firstModelRerun: false, primary: contract.metrics.PRIMARY, secondary: contract.metrics.SECONDARY, diagnostic: contract.metrics.DIAGNOSTIC, categoryGroups: contract.slicePolicies.category.groups, difficultyGroups: contract.slicePolicies.difficulty.groups, languageGroups: contract.slicePolicies.language.groups },
    provenanceSelfAttestation: { beforeProtectedAccess: true, runManifestDirectlyBinds: ["PREPARATION_SHA_AND_PAYLOAD", "RUNNER_SHA", "METRICS_HELPER_SHA", "MODEL_ADAPTER_SHA", "PROTECTED_BRIDGE_SHA", "PROTECTED_SOURCE_LOADER_SHA", "CONTRACT_SHA_AND_PAYLOAD", "METHODOLOGY_SHA_AND_PAYLOAD"], mismatchFailsBeforeProtectedAccess: true, exactExecutedSourceGapPrevented: true },
    testEvidence: { syntaxCheckPassed: evidence.syntaxCheckPassed, syntheticSelfTestPassed: evidence.syntheticSelfTestPassed, protectedFreePreflightPassed: evidence.protectedFreePreflightPassed, syntheticRows: 153, syntheticMockForwardPasses: 20, realModelLoaded: false, protectedSourcesAccessed: false, exposureCycleConsumed: false },
    execution: { modes: ["--preflight", "--self-test", "--execute-authorized-local-run"], arbitraryOverridesAccepted: false, packageCommand: "npm run evaluate:text-moderation:mhs-v2-successor-local", localCommand: "cd D:\\StHn\\backend && npm run evaluate:text-moderation:mhs-v2-successor-local", preparationRunsExecutionMode: false, nextPhaseAfterUserRun: "T6L-8F-D_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CERTIFICATION_AND_PAIRED_COMPARISON" },
    boundaries: { realModelLoads: 0, realForwardPasses: 0, syntheticMockForwardPasses: 20, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, realExposureEventsWritten: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 }, preparedAt: MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARED_AT,
  };
  const artifact: MhsV2SuccessorReusedEvaluationPreparationArtifact = { ...payload, preparationPayloadDigest: digest(payload) }; validateMhsV2SuccessorReusedEvaluationPreparation(artifact); return artifact;
};

export const validateMhsV2SuccessorReusedEvaluationPreparation = (artifact: MhsV2SuccessorReusedEvaluationPreparationArtifact): void => {
  const { preparationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SCHEMA || artifact.preparationVersion !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_VERSION || artifact.phase !== "T6L-8F-C_LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION" || artifact.status !== "LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_READY" || preparationPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8F-C identity or payload");
  if (MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_PAYLOAD_DIGEST && preparationPayloadDigest !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8F-C pinned payload");
  if (MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SHA256 && sha256(Buffer.from(canonicalJson(artifact), "utf8")) !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_SHA256) throw new Error("Invalid T6L-8F-C pinned artifact");
  if (artifact.runtime.device !== "CPU" || artifact.runtime.precision !== "FP32" || artifact.resourcePolicy.ramEligibilityGate !== "NONE" || artifact.modelObservation.auxiliaryObservation !== "PROHIBITED" || artifact.protectedBoundary.preflightProtectedAccess !== false || artifact.execution.preparationRunsExecutionMode !== false || Object.entries(artifact.boundaries).some(([key, value]) => key === "syntheticMockForwardPasses" ? value !== 20 : value !== 0)) throw new Error("Invalid T6L-8F-C execution boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorReusedEvaluationPreparation = (artifact: MhsV2SuccessorReusedEvaluationPreparationArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorReusedEvaluationPreparation(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_PREPARATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8F-C preparation exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8F-C publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
