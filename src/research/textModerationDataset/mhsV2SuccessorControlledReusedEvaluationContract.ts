import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256,
  validateMhsV2ControlledEvaluationCertification,
} from "./mhsV2ControlledEvaluationCertification";
import {
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256,
  validateMhsV2ControlledEvaluationContract,
} from "./mhsV2ControlledEvaluationContract";
import {
  MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256,
  validateMhsV2ControlledEvaluationPreparation,
} from "./mhsV2ControlledEvaluationPreparation";
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

export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_V1" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_VERSION = "MHS_V2_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_V1" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FILENAME = "mhs-v2-successor-controlled-reused-evaluation-contract-v1.json" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256 = "5c0053213dc3993424ab687d2800f2ed9716ba7f10dfbaa34fd863f5afaecb02";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST = "0dfdcf4e0746d1c6a39acc4530c40780d59cf9f7471bc7361893db003a875d59";
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FROZEN_AT = "2026-09-30T00:00:00.000Z" as const;
export const MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-category-aware-reused-protected-evaluation-v1" as const;

const INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const INTERNAL_FREEZE_PAYLOAD = "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb";
const INTERNAL_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const SUCCESSOR_MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const SUCCESSOR_CONFIG_SHA = "2f48155190967d11204a0ad87787a179e4ec0d708ac47e8730a1c8ed77f6ec78";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_AUTHORITY_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const FINAL_TOKENIZER_BINDING_SHA = "151e78bcd3f3132a49671497baac2f7c8fa0af6808e6572a41b57b1d092a4629";
const BASE_WEIGHT_SHA = "6fd4797bc397c3b8b55d6bb5740366b57e6a3ce91c04c77f22aafc0c128e6feb";
const FIRST_RUN_MANIFEST_SHA = "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718";
const FIRST_INTERNAL_PREDICTIONS_SHA = "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be";
const FIRST_BENCHMARK_PREDICTIONS_SHA = "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743";
const FIRST_BRIDGE_SHA = "dd6f90fc0e4ff224faf417636108df4a1c591aff7448bfbea125c642c5359525";
const FIRST_PROTECTED_SOURCE_LOADER_SHA = "1ba59c081550e80b3244a2c558aafcfd60bf0c8bf260787330e82ca2b06e088a";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
type Json = Record<string, any>;

export interface MhsV2SuccessorReusedEvaluationContractPaths {
  readonly methodology: string; readonly successorCertification: string; readonly d0: string; readonly waiver: string;
  readonly successorModel: string; readonly successorConfig: string; readonly tokenizer: string; readonly tokenizerAuthorityBinding: string; readonly finalTokenizerBinding: string;
  readonly internalFreeze: string; readonly firstContract: string; readonly firstPreparation: string; readonly firstCertification: string;
  readonly firstRunManifest: string; readonly firstInternalPredictions: string; readonly firstBenchmarkPredictions: string;
  readonly firstBridge: string; readonly firstProtectedSourceLoader: string;
}

export interface MhsV2SuccessorReusedEvaluationContractArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SCHEMA;
  readonly contractVersion: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_VERSION;
  readonly phase: "T6L-8F-B_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT";
  readonly status: "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_READY";
  readonly authorities: Json; readonly candidate: Json; readonly provenanceWaiver: Json; readonly classification: Json;
  readonly exposureHistory: Json; readonly reuseBudget: Json; readonly evaluationCycle: Json; readonly runtime: Json; readonly ramPolicy: Json;
  readonly preprocessing: Json; readonly modelObservation: Json; readonly decisionAndScores: Json; readonly rowLevelOutput: Json;
  readonly privacy: Json; readonly firstCandidateComparison: Json; readonly pairedComparison: Json; readonly metrics: Json;
  readonly slicePolicies: Json; readonly statisticalPolicy: Json; readonly thresholdPolicy: Json; readonly interpretation: Json;
  readonly failureSemantics: Json; readonly exposureSemantics: Json; readonly retrySemantics: Json; readonly publicationSemantics: Json;
  readonly futureConsequences: Json; readonly executionPlan: Json; readonly boundaries: Readonly<Record<string, number>>;
  readonly frozenAt: typeof MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FROZEN_AT; readonly contractPayloadDigest: string;
}

export const defaultMhsV2SuccessorReusedEvaluationContractPaths = (root = process.cwd()): MhsV2SuccessorReusedEvaluationContractPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), training = path.join(mhs, "training");
  const successor = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1");
  const firstEvaluation = path.resolve(root, "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1");
  const firstTraining = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1");
  const cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  return {
    methodology: path.join(mhs, "evaluation/mhs-v2-successor-evaluation-methodology-v1.json"), successorCertification: path.join(training, "mhs-v2-successor-local-training-run-certification-v1.json"),
    d0: path.join(training, "mhs-v2-successor-training-provenance-recovery-v1.json"), waiver: path.join(training, "mhs-v2-successor-training-provenance-waiver-v1.json"),
    successorModel: path.join(successor, "final/model.safetensors"), successorConfig: path.join(successor, "final/config.json"), tokenizer: path.join(cache, "tokenizer.json"),
    tokenizerAuthorityBinding: path.join(firstTraining, "final/tokenizer-binding.json"), finalTokenizerBinding: path.join(successor, "final/tokenizer-binding.json"),
    internalFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), firstContract: path.join(training, "mhs-v2-controlled-evaluation-contract-v1.json"),
    firstPreparation: path.join(training, "mhs-v2-controlled-evaluation-runner-preparation-v1.json"), firstCertification: path.join(training, "mhs-v2-first-controlled-evaluation-certification-v1.json"),
    firstRunManifest: path.join(firstEvaluation, "run/run-manifest.json"), firstInternalPredictions: path.join(firstEvaluation, "internal-test/predictions.jsonl"),
    firstBenchmarkPredictions: path.join(firstEvaluation, "external-benchmark/predictions.jsonl"), firstBridge: path.resolve(root, "src/scripts/readMhsV2ProtectedEvaluationSource.ts"),
    firstProtectedSourceLoader: path.resolve(root, "src/research/textModerationDataset/mhsV2ProtectedEvaluationSources.ts"),
  };
};

const read = (filename: string): Json => JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
const exactSha = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8F-B ${label} SHA mismatch`); };
const same = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8F-B ${label} mismatch`); };
const readPredictionMetadata = (filename: string, source: string, expectedCount: number): readonly Json[] => {
  const rows = fs.readFileSync(filename, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Json);
  const expectedKeys = ["allowLogit", "allowScore", "blockLogit", "blockScore", "correct", "exampleId", "metadata", "predictedDecision", "predictedTarget", "source", "textSha256", "trueDecision", "trueTarget", "truncated"];
  if (rows.length !== expectedCount || new Set(rows.map((row) => row.exampleId)).size !== expectedCount) throw new Error(`T6L-8F-B ${source} first-prediction membership mismatch`);
  for (const row of rows) {
    same(Object.keys(row).sort(), expectedKeys, `${source} first-prediction schema`);
    if (row.source !== source || !/^[a-f0-9]{64}$/u.test(row.textSha256) || ![0, 1].includes(row.trueTarget) || typeof row.correct !== "boolean" || !Number.isFinite(row.allowLogit) || !Number.isFinite(row.blockLogit) || !Number.isFinite(row.allowScore) || !Number.isFinite(row.blockScore)) throw new Error(`T6L-8F-B ${source} first-prediction identity mismatch`);
    if (["text", "rawText", "auxiliaryLogits", "auxiliaryScores", "embedding", "hiddenStates", "tokenIds"].some((key) => Object.prototype.hasOwnProperty.call(row, key))) throw new Error(`T6L-8F-B ${source} first-prediction forbidden field`);
  }
  return rows;
};

export const createMhsV2SuccessorReusedEvaluationContract = (paths: MhsV2SuccessorReusedEvaluationContractPaths): MhsV2SuccessorReusedEvaluationContractArtifact => {
  const pinned: readonly [string, string, string][] = [
    [paths.methodology, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256, "8F-A methodology"], [paths.successorCertification, MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, "successor certification"],
    [paths.d0, MHS_V2_SUCCESSOR_PROVENANCE_SHA256, "D0"], [paths.waiver, MHS_V2_SUCCESSOR_WAIVER_SHA256, "D0W"], [paths.successorModel, SUCCESSOR_MODEL_SHA, "successor model"],
    [paths.successorConfig, SUCCESSOR_CONFIG_SHA, "successor config"], [paths.tokenizer, TOKENIZER_SHA, "tokenizer"], [paths.tokenizerAuthorityBinding, TOKENIZER_AUTHORITY_BINDING_SHA, "tokenizer authority binding"],
    [paths.finalTokenizerBinding, FINAL_TOKENIZER_BINDING_SHA, "successor tokenizer binding"], [paths.internalFreeze, INTERNAL_FREEZE_SHA, "INTERNAL_TEST freeze"],
    [paths.firstContract, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, "8D-A contract"], [paths.firstPreparation, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256, "8D-B preparation"],
    [paths.firstCertification, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256, "8D-D certification"], [paths.firstRunManifest, FIRST_RUN_MANIFEST_SHA, "first run manifest"],
    [paths.firstInternalPredictions, FIRST_INTERNAL_PREDICTIONS_SHA, "first INTERNAL_TEST predictions"], [paths.firstBenchmarkPredictions, FIRST_BENCHMARK_PREDICTIONS_SHA, "first benchmark predictions"],
    [paths.firstBridge, FIRST_BRIDGE_SHA, "first bridge"], [paths.firstProtectedSourceLoader, FIRST_PROTECTED_SOURCE_LOADER_SHA, "first protected loader"],
  ];
  pinned.forEach(([filename, expected, label]) => exactSha(filename, expected, label));
  const methodology = read(paths.methodology), successor = read(paths.successorCertification), d0 = read(paths.d0), waiver = read(paths.waiver), freeze = read(paths.internalFreeze), firstContract = read(paths.firstContract), firstPreparation = read(paths.firstPreparation), first = read(paths.firstCertification), firstManifest = read(paths.firstRunManifest);
  validateMhsV2SuccessorEvaluationMethodology(methodology as Parameters<typeof validateMhsV2SuccessorEvaluationMethodology>[0]); validateMhsV2SuccessorLocalTrainingCertification(successor as Parameters<typeof validateMhsV2SuccessorLocalTrainingCertification>[0]); validateMhsV2SuccessorProvenanceRecovery(d0 as Parameters<typeof validateMhsV2SuccessorProvenanceRecovery>[0]); validateMhsV2SuccessorTrainingProvenanceWaiver(waiver as Parameters<typeof validateMhsV2SuccessorTrainingProvenanceWaiver>[0]); validateMhsV2ControlledEvaluationContract(firstContract as Parameters<typeof validateMhsV2ControlledEvaluationContract>[0]); validateMhsV2ControlledEvaluationPreparation(firstPreparation as Parameters<typeof validateMhsV2ControlledEvaluationPreparation>[0]); validateMhsV2ControlledEvaluationCertification(first);
  same([methodology.methodologyPayloadDigest, successor.certificationPayloadDigest, d0.recoveryPayloadDigest, waiver.waiverPayloadDigest, firstContract.contractPayloadDigest, firstPreparation.preparationPayloadDigest, first.certificationPayloadDigest], [MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST], "authority payloads");
  same([freeze.candidateCount, freeze.freezePayloadDigest, freeze.protectedMembershipDigest, freeze.decisionComposition], [13, INTERNAL_FREEZE_PAYLOAD, INTERNAL_MEMBERSHIP, { ALLOW: 9, BLOCK: 4 }], "INTERNAL_TEST metadata");
  same([firstContract.authorities.externalBenchmark.version, firstContract.authorities.externalBenchmark.sha256, firstContract.authorities.externalBenchmark.count], ["STHN_TEXT_MODERATION_FIXTURES_V1R", BENCHMARK_SHA, 140], "benchmark metadata");
  same([successor.status, successor.checkpoints.selectedEpoch, successor.checkpoints.selectedCheckpointModelSha256, successor.checkpoints.finalModelSha256], ["SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER", 3, SUCCESSOR_MODEL_SHA, SUCCESSOR_MODEL_SHA], "successor selection");
  same([successor.modelAndTokenizer.baseModel.repository, successor.modelAndTokenizer.baseModel.revision, successor.modelAndTokenizer.baseModel.weightSha256, successor.modelAndTokenizer.tokenizer.sha256, successor.modelAndTokenizer.tokenizer.authorityBindingSha256], ["FacebookAI/xlm-roberta-base", "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", BASE_WEIGHT_SHA, TOKENIZER_SHA, TOKENIZER_AUTHORITY_BINDING_SHA], "model and tokenizer");
  const internalPredictions = readPredictionMetadata(paths.firstInternalPredictions, "INTERNAL_TEST", 13), benchmarkPredictions = readPredictionMetadata(paths.firstBenchmarkPredictions, "EXTERNAL_BENCHMARK", 140);
  same(firstManifest.artifacts.filter((item: Json) => /predictions\.jsonl$/u.test(item.path)).map((item: Json) => [item.path, item.byteSize, item.sha256]), [["internal-test/predictions.jsonl", 6053, FIRST_INTERNAL_PREDICTIONS_SHA], ["external-benchmark/predictions.jsonl", 78620, FIRST_BENCHMARK_PREDICTIONS_SHA]], "first prediction manifest index");
  const cycleBasis = { contractVersion: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_VERSION, methodologySha256: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256, successorCertificationSha256: MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, successorModelSha256: SUCCESSOR_MODEL_SHA, internalTestAuthoritySha256: INTERNAL_FREEZE_SHA, benchmarkAuthoritySha256: BENCHMARK_SHA };
  const evaluationCycleId = `mhs-v2-successor-reused-protected-evaluation-cycle-v1-${digest(cycleBasis).slice(0, 24)}`;
  const perSourceMetrics = ["COUNT", "GROUND_TRUTH_COUNTS", "PREDICTED_COUNTS", "CONFUSION_MATRIX", "ACCURACY", "ALLOW_PRECISION", "ALLOW_RECALL", "ALLOW_F1", "BLOCK_PRECISION", "BLOCK_RECALL", "BLOCK_F1", "MACRO_F1", "BALANCED_ACCURACY", "FALSE_POSITIVES", "FALSE_NEGATIVES"];
  const compactGroups = (groups: Json, keys: readonly string[], fields: readonly string[]): Json => Object.fromEntries(keys.map((key) => [key, Object.fromEntries(fields.map((field) => [field, groups[key][field]]))]));
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SCHEMA, contractVersion: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_VERSION, phase: "T6L-8F-B_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT" as const, status: "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_READY" as const,
    authorities: {
      methodology: { sha256: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256, payloadDigest: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST, status: methodology.status }, successorCertification: { sha256: MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, payloadDigest: MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST, status: successor.status },
      d0: { sha256: MHS_V2_SUCCESSOR_PROVENANCE_SHA256, payloadDigest: MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST }, d0w: { sha256: MHS_V2_SUCCESSOR_WAIVER_SHA256, payloadDigest: MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST },
      firstEvaluationContract: { sha256: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST }, firstEvaluationPreparation: { sha256: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST }, firstEvaluationCertification: { sha256: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST, status: first.status },
      internalTest: { sha256: INTERNAL_FREEZE_SHA, payloadDigest: INTERNAL_FREEZE_PAYLOAD, membershipDigest: INTERNAL_MEMBERSHIP, rows: 13, ALLOW: 9, BLOCK: 4 }, benchmark: { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: BENCHMARK_SHA, rows: 140, ALLOW: 67, BLOCK: 73 },
      firstPredictionEvidence: { runManifestSha256: FIRST_RUN_MANIFEST_SHA, INTERNAL_TEST: { relativePath: "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1/internal-test/predictions.jsonl", sha256: FIRST_INTERNAL_PREDICTIONS_SHA, byteSize: 6053, rows: internalPredictions.length }, EXTERNAL_BENCHMARK: { relativePath: "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1/external-benchmark/predictions.jsonl", sha256: FIRST_BENCHMARK_PREDICTIONS_SHA, byteSize: 78620, rows: benchmarkPredictions.length } },
      reusableArchitecturePrecedent: { bridgeSha256: FIRST_BRIDGE_SHA, protectedSourceLoaderSha256: FIRST_PROTECTED_SOURCE_LOADER_SHA, directReuseWithoutSuccessorSpecificPreparationAuthorized: false },
    },
    candidate: { identity: "MHS_V2_XLM_ROBERTA_CATEGORY_AWARE_SELECTED_EPOCH_03", selectedEpoch: 3, selectedCheckpoint: "checkpoints/checkpoint-epoch-03", finalModelRelativePath: "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-category-aware-run-v1/final/model.safetensors", finalModelSha256: SUCCESSOR_MODEL_SHA, finalConfigSha256: SUCCESSOR_CONFIG_SHA, architecture: "XLMRobertaSharedEncoderWithBinaryAndAuxiliaryCategoryHeads", baseModel: { repository: "FacebookAI/xlm-roberta-base", revision: "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", weightSha256: BASE_WEIGHT_SHA }, tokenizer: { implementation: "XLMRobertaTokenizerFast", sha256: TOKENIZER_SHA, authorityBindingSha256: TOKENIZER_AUTHORITY_BINDING_SHA, finalBindingSha256: FINAL_TOKENIZER_BINDING_SHA }, productionReady: false },
    provenanceWaiver: { code: "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", permanentlyDisclosed: true, exactHistoricalExecutedRunnerOrCustomModelBytesProven: false, provenanceRecovered: false, evaluationDoesNotEraseQualification: true },
    classification: { name: "CONTROLLED_REUSED_PROTECTED_COMPARISON", freshUnseenHoldout: false, independentProductionGeneralizationEstimate: false, benchmarkDevelopmentInfluential: true, sourceRoles: { INTERNAL_TEST: "SMALL_REUSED_REGRESSION_AND_PAIRED_COMPARISON_SET", EXTERNAL_BENCHMARK: "CONTROLLED_REUSED_COMPARISON_BENCHMARK" } },
    exposureHistory: { projectLevel: "FIRST_CANDIDATE_ALREADY_EVALUATED", firstCandidate: { INTERNAL_TEST: 1, EXTERNAL_BENCHMARK: 1 }, successorBeforeThisCycle: { INTERNAL_TEST: 0, EXTERNAL_BENCHMARK: 0 }, units: "VERSIONED_EVALUATION_CYCLES_NOT_EXAMPLE_COUNTS" },
    reuseBudget: { authorizedAdditionalSuccessorCyclesBeforeExposure: 1, remainingAuthorizedSuccessorCyclesAfterFirstProtectedAccess: 0, remainingAuthorizedSuccessorCyclesAfterSuccessfulCompletion: 0, cycleCovers: ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], unlimitedRetryAuthorized: false, silentResetAuthorized: false },
    evaluationCycle: { id: evaluationCycleId, deterministic: true, basis: cycleBasis, outputRoot: MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT, arbitraryOutputRootOverride: false },
    runtime: { device: "CPU", gpuAuthorized: false, precision: "FP32", mixedPrecision: false, gradients: false, evaluationMode: true, training: false, optimizer: null, scheduler: null, batchSize: 8, workers: 0, modelMutation: false, network: false, localUserExecutionRequired: true },
    ramPolicy: { eligibilityGate: "NONE", minimumAvailableBytes: null, minimumTotalBytes: null, percentageThreshold: null, configurableThreshold: false, warningMayBlock: false, resourceDiagnostics: { permitted: true, authoritativeForEligibility: false }, allocationFailureMayNaturallyFail: true },
    preprocessing: { exactUnicode: true, tokenizer: "XLMRobertaTokenizerFast", tokenizerSha256: TOKENIZER_SHA, maxLength: 160, padding: "DYNAMIC_RIGHT", truncation: "DETERMINISTIC_RIGHT", normalization: false, rewriting: false, translation: false, transliteration: false, augmentation: false, protectedTextMutation: false },
    modelObservation: { authorizedOutput: "BINARY_MODERATION_LOGITS_ONLY", binaryHeadLabels: 2, auxiliaryHeadLabels: 5, auxiliaryHeadObservation: "PROHIBITED", auxiliaryTensorInternalComputationIfArchitecturallyUnavoidable: "TRANSIENT_ONLY_NOT_READ_RETURNED_LOGGED_PERSISTED_OR_USED", persistAuxiliaryLogits: false, persistAuxiliaryScores: false, persistAuxiliaryPredictions: false, auxiliaryMetrics: false, auxiliaryOutputMayAffectBinaryDecision: false },
    decisionAndScores: { labels: { ALLOW: 0, BLOCK: 1 }, rule: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", tieRule: "LOWEST_LABEL_INDEX_ALLOW", heuristicOverride: false, categoryOverride: false, deterministicRuleOverride: false, scoreComputation: "DETERMINISTIC_SOFTMAX_OF_TWO_BINARY_LOGITS", scoreLabel: "UNCALIBRATED_MODEL_SCORE", confidenceClaimAuthorized: false, thresholdControlsDecision: false },
    rowLevelOutput: { format: "CANONICAL_JSONL", requiredFields: ["source", "exampleId", "textSha256", "trueDecision", "trueTarget", "predictedDecision", "predictedTarget", "allowLogit", "blockLogit", "allowScore", "blockScore", "correct", "truncated", "metadata"], boundedMetadataBySource: { INTERNAL_TEST: ["primaryCategory"], EXTERNAL_BENCHMARK: ["domain", "target", "difficulty", "language", "tags", "expectedCategory"] }, forbiddenFields: ["text", "rawText", "auxiliaryLogits", "auxiliaryProbabilities", "auxiliaryScores", "auxiliaryPrediction", "embeddings", "hiddenStates", "tokenIds", "attentionTensors", "gradients"], finiteLogitsRequired: true, finiteScoresRequired: true, scoreSumTolerance: 1e-9, noSilentRowSkipping: true },
    privacy: { thisPhaseProtectedRawTextAccesses: 0, futureRawTextLocation: "TRANSIENT_AUTHORIZED_LOADER_TO_BINARY_INFERENCE_BOUNDARY_ONLY", rawTextMayBePrintedLoggedPersistedOrIncludedInErrors: false, persistedIdentity: "TEXT_SHA256", lifecycleContainsRawText: false, exposureLedgerContainsRawText: false, certificationContainsRawText: false },
    firstCandidateComparison: { rerunFirstModel: false, authority: "IMMUTABLE_CERTIFIED_ROW_PREDICTIONS_AND_AGGREGATES", pairedEvidenceComplete: true, joinDimensionsSupported: ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"], baseline: { INTERNAL_TEST: first.sourceResults.INTERNAL_TEST.metrics, EXTERNAL_BENCHMARK: first.sourceResults.EXTERNAL_BENCHMARK.metrics, category: compactGroups(first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.expectedCategory, ["ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"], ["count", "blockRecall"]), difficulty: compactGroups(first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.difficulty, ["ADVERSARIAL", "CONTEXTUAL", "EASY"], ["count", "accuracy", "macroF1"]), language: compactGroups(first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.language, ["en", "en-hi", "hi", "hi-Latn", "th"], ["count", "accuracy", "macroF1"]) } },
    pairedComparison: { joinKeys: ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"], exactOneToOneJoinRequired: true, missingUnknownDuplicateOrTargetMismatch: "FAIL_CLOSED", transitionsPerSource: ["FIRST_WRONG_SUCCESSOR_CORRECT", "FIRST_CORRECT_SUCCESSOR_WRONG", "BOTH_CORRECT", "BOTH_WRONG"], benchmarkTransitionsBy: ["EXPECTED_CATEGORY", "DIFFICULTY", "LANGUAGE"], rateAndScoreDeltaDirection: "SUCCESSOR_MINUS_FIRST", errorCountDeltaDirection: "SUCCESSOR_MINUS_FIRST", errorDeltaInterpretation: { negativeFalseNegativeDelta: "FEWER_FALSE_NEGATIVES", negativeFalsePositiveDelta: "FEWER_FALSE_POSITIVES" } },
    metrics: { definitionsInheritedExactlyFrom: "T6L_8D_A", labelOrder: ["ALLOW", "BLOCK"], confusionMatrixAxes: { rows: "TRUE_LABEL", columns: "PREDICTED_LABEL" }, zeroDenominatorRule: "RETURN_ZERO", computedSeparatelyFor: ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], perSource: perSourceMetrics, PRIMARY: ["BENCHMARK_PAIRED_TRANSITIONS", "BENCHMARK_MACRO_F1_DELTA", "BENCHMARK_BALANCED_ACCURACY_DELTA", "BENCHMARK_BLOCK_RECALL_DELTA", "BENCHMARK_FALSE_NEGATIVE_DELTA", "BENCHMARK_FALSE_POSITIVE_DELTA"], SECONDARY: ["BENCHMARK_ALLOW_PRECISION_RECALL_F1_DELTAS", "BENCHMARK_BLOCK_PRECISION_AND_F1_DELTAS", "BENCHMARK_CATEGORY_BLOCK_RECALL_DELTAS_AND_TRANSITIONS", "INTERNAL_TEST_ALL_METRIC_DELTAS_AND_PAIRED_TRANSITIONS"], DIAGNOSTIC: ["BENCHMARK_DIFFICULTY_TOTAL_ACCURACY_MACRO_F1_DELTA_AND_TRANSITIONS", "BENCHMARK_LANGUAGE_TOTAL_ACCURACY_MACRO_F1_DELTA_AND_TRANSITIONS", "BENCHMARK_CATEGORY_DENOMINATORS", "UNSCALED_BINARY_LOGITS_AND_UNCALIBRATED_SCORE_SUMMARIES"] },
    slicePolicies: { category: { groups: ["ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"], denominators: { ABUSIVE_OR_HARASSING: 11, HATE: 10, OTHER_INAPPROPRIATE: 5, PROFANITY: 4, SEXUAL: 18, THREAT_OR_VIOLENCE: 25 }, outputs: ["CORRECT_BLOCK_COUNT", "TOTAL_BLOCK_COUNT", "BLOCK_RECALL", "SUCCESSOR_MINUS_FIRST_DELTA", "IMPROVED_UNCHANGED_DEGRADED"], auxiliaryHeadEvaluation: false, passFailThreshold: null }, difficulty: { groups: ["ADVERSARIAL", "CONTEXTUAL", "EASY"], outputs: ["TOTAL", "ACCURACY", "MACRO_F1", "PAIRED_TRANSITIONS", "SUCCESSOR_MINUS_FIRST_DELTAS"], passFailThreshold: null }, language: { groups: ["en", "en-hi", "hi", "hi-Latn", "th"], outputs: ["TOTAL", "ACCURACY", "MACRO_F1", "PAIRED_TRANSITIONS", "SUCCESSOR_MINUS_FIRST_DELTAS"], smallGroupWarningsRequired: true, passFailThreshold: null } },
    statisticalPolicy: { classification: "DESCRIPTIVE_PAIRED_COMPARISON_ONLY", exactTransitionCounts: true, bootstrapConfidenceIntervals: false, mcnemarTest: false, pValues: false, significanceClaims: false, postResultMethodSelection: false },
    thresholdPolicy: { productionStatus: "NOT_SELECTED", selection: false, sweep: false, fittingFromInternalTest: false, fittingFromBenchmark: false, calibration: false, qualityPassFailThreshold: null, globalWinnerRule: null },
    interpretation: { pooled153RowMetric: false, sourceWeighting: null, allowedClaims: ["SUCCESSOR_MINUS_FIRST_DELTAS_ON_REUSED_SOURCE", "EXACT_PAIRED_TRANSITION_COUNTS", "QUALIFIED_CATEGORY_DIFFICULTY_LANGUAGE_DIFFERENCES_WITH_DENOMINATORS"], requiredQualification: "PREVIOUSLY_OBSERVED_DEVELOPMENT_INFLUENTIAL_PROTECTED_SOURCES;_CONTROLLED_COMPARATIVE_EVIDENCE_NOT_AN_INDEPENDENT_UNTOUCHED_PRODUCTION_ESTIMATE", prohibitedClaims: ["FRESH_UNSEEN_HOLDOUT", "INDEPENDENT_PRODUCTION_GENERALIZATION", "PRODUCTION_READINESS", "PRODUCTION_APPROVAL", "CALIBRATED_CONFIDENCE", "PRODUCTION_THRESHOLD", "GLOBAL_SUCCESSOR_WINS_OR_FIRST_WINS", "PROVENANCE_RECOVERED"] },
    failureSemantics: { failClosedOn: ["MODEL_HASH_MISMATCH", "TOKENIZER_MISMATCH", "CERTIFICATION_MISMATCH", "METHODOLOGY_MISMATCH", "PROTECTED_AUTHORITY_MISMATCH", "ROW_COUNT_MISMATCH", "MEMBERSHIP_MISMATCH", "DUPLICATE_EXAMPLE_ID", "TEXT_DIGEST_MISMATCH", "TARGET_MISMATCH", "FIRST_PREDICTION_JOIN_MISMATCH", "UNSUPPORTED_CATEGORY_METADATA", "INVALID_OR_NONFINITE_LOGIT", "NAN_OR_INFINITY", "INCOMPLETE_OUTPUT", "EXPOSURE_LEDGER_FAILURE", "LIFECYCLE_PUBLICATION_FAILURE", "INTERRUPTION"], silentlySkipRows: false, automaticRepair: false, partialMetricsAuthoritative: false },
    exposureSemantics: { lifecycleStates: ["INITIALIZING", "RUNNING", "FAILED_PRE_EXPOSURE", "FAILED_POST_EXPOSURE", "INTERRUPTED_POST_EXPOSURE", "COMPLETED"], ledgerPath: "run/protected-exposure-ledger.jsonl", rawTextIncluded: false, events: ["EVALUATION_CYCLE_INITIALIZED", "INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED", "EVALUATION_CYCLE_COMPLETED"], accessStartMustBeDurableBeforeLoaderInvocation: true, irreversibleExposurePoint: "FIRST_SOURCE_ACCESS_STARTED_EVENT_DURABLY_APPENDED_AND_SYNCED", firstAccessConsumesAuthorizedCycle: true, sourceAndCandidateAndCycleBoundPerEvent: true },
    retrySemantics: { preInferenceFailure: "SAME_CYCLE_RETRY_PERMITTED_ONLY_WHEN_DURABLE_LEDGER_PROVES_ZERO_SOURCE_ACCESS_EVENTS", postExposureFailure: "NO_FRESH_RESTART_OR_NEW_OUTPUT_ROOT;_SEPARATELY_AUTHORIZED_IN_PLACE_RECOVERY_ONLY", recoveryMayReaccessStartedSource: false, completedReplay: "REFUSED", unlimitedFailedExecutionLoop: false, exposureHistoryMayBeDeletedOrReset: false },
    publicationSemantics: { outputRoot: MHS_V2_SUCCESSOR_REUSED_EVALUATION_OUTPUT_ROOT, arbitraryOverride: false, rootInitializedBeforeProtectedAccess: true, sourceOutputsSealedBeforeNextSource: true, artifactWrites: "TEMPORARY_THEN_ATOMIC_RENAME", hashesAndByteSizesInManifest: true, completionRequires: ["BOTH_SOURCE_EVALUATIONS_COMPLETE", "EXPECTED_COUNTS_MATCH", "ROW_INTEGRITY_VALID", "AGGREGATES_RECONCILE", "PAIRED_JOINS_RECONCILE", "EXPOSURE_LEDGER_DURABLE", "LIFECYCLE_DURABLE", "RESULT_PUBLICATION_SUCCEEDS"], completionCommitAuthority: "COMPLETED_LIFECYCLE_PUBLISHED_LAST", partialRunAuthoritative: false, overwriteRefused: true },
    futureConsequences: { remainingProtectedComparisonCyclesAfterExposure: 0, laterCandidateInfluencedByResults: "BENCHMARK_INFORMED_DEVELOPMENT", benchmarkUntouchedIndependentClaimForLaterInformedCandidate: false, silentExposureReset: false, newManualDatasetOrReviewRequired: false },
    executionPlan: { thisPhaseCreatesRunner: false, thisPhaseRunsEvaluation: false, nextPhase: "T6L-8F-C_LOCAL_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_RUNNER_PREPARATION", futureUserExecutionRequired: true },
    boundaries: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 }, frozenAt: MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FROZEN_AT,
  };
  const artifact: MhsV2SuccessorReusedEvaluationContractArtifact = { ...payload, contractPayloadDigest: digest(payload) }; validateMhsV2SuccessorReusedEvaluationContract(artifact); return artifact;
};

export const validateMhsV2SuccessorReusedEvaluationContract = (artifact: MhsV2SuccessorReusedEvaluationContractArtifact): void => {
  const { contractPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SCHEMA || artifact.contractVersion !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_VERSION || artifact.phase !== "T6L-8F-B_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT" || artifact.status !== "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT_READY" || contractPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8F-B identity or payload");
  if (MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST && contractPayloadDigest !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8F-B pinned payload");
  if (MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256 && sha256(Buffer.from(canonicalJson(artifact), "utf8")) !== MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_SHA256) throw new Error("Invalid T6L-8F-B pinned artifact");
  if (artifact.classification.name !== "CONTROLLED_REUSED_PROTECTED_COMPARISON" || artifact.classification.freshUnseenHoldout !== false || artifact.reuseBudget.authorizedAdditionalSuccessorCyclesBeforeExposure !== 1 || artifact.reuseBudget.remainingAuthorizedSuccessorCyclesAfterFirstProtectedAccess !== 0 || artifact.modelObservation.auxiliaryHeadObservation !== "PROHIBITED" || artifact.thresholdPolicy.productionStatus !== "NOT_SELECTED" || artifact.interpretation.pooled153RowMetric !== false || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8F-B settled boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorReusedEvaluationContract = (artifact: MhsV2SuccessorReusedEvaluationContractArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorReusedEvaluationContract(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CONTRACT_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8F-B contract exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8F-B publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
