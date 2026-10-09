import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { metricValues, PredictionRecord, readPredictionJsonl, sha256FileStreaming } from "./mhsV2ControlledEvaluationCertification";

export const MHS_V2_POST_EVALUATION_DIAGNOSTIC_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_POST_EVALUATION_DIAGNOSTIC_ANALYSIS_V1" as const;
export const MHS_V2_POST_EVALUATION_DIAGNOSTIC_VERSION = "MHS_V2_POST_EVALUATION_DIAGNOSTIC_ANALYSIS_V1" as const;
export const MHS_V2_POST_EVALUATION_DIAGNOSTIC_FILENAME = "mhs-v2-post-evaluation-diagnostic-analysis-v1.json" as const;
export const MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256 = "edec2e9cfff145e02ac3dc5d3addc18eeb4983a4d2b670638be519da28d88dd5";
export const MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST = "c7cb4839792e2fade4e9ffd4f5a4b01cc40d9c83f64dc10bac90f100dc394d1a";

const CERTIFICATION_SHA = "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a";
const CERTIFICATION_PAYLOAD = "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943";
const EVALUATION_MANIFEST_SHA = "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718";
const EVALUATION_MANIFEST_PAYLOAD = "52d71642b456a1a2fe2de631d82d138787901a407fb7f96fddb7fa2e9bbcd90e";
const CANDIDATE_SHA = "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const TRAIN_SHA = "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74";
const TRAIN_PAYLOAD = "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff";
const TRAIN_MEMBERSHIP = "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61";
const VALIDATION_SHA = "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29";
const VALIDATION_PAYLOAD = "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095";
const VALIDATION_MEMBERSHIP = "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164";
const INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const TRAINING_READY_SHA = "62d6139891fb56b2c6d0c2c18f63aa7e20000ef02fbd33e3bf9308a5ee90f6c1";
const TRAINING_READY_PAYLOAD = "51fdbbfa4b4df15fbf5c3e64aa090c66c923a45ce12e91f35dd4024d4295e0ee";
const MATERIALIZATION_SHA = "eb4372cc839052870163d7d83fc9834281121a29622456fe6db10d8585b18a67";
const MATERIALIZATION_PAYLOAD = "71b6c2c471e36417a4d54ef665be15bf437f24617ca8ee43de02b03d61eb175a";
const RELEASE_SHA = "a001c63cf1d4674d9dcad89c9e630348ce3e1461a6e8cd12971b813724e65ec7";
const RELEASE_PAYLOAD = "1575c609b85dcbfdd164099ce7fb13901226d60a261958ea8aa16cf8d5c8e9a4";
const ELIGIBILITY_SHA = "1201be0665a82b03ab9e056e8bad16737afaf8cf6159602fde3ecf8cf00d7649";
const ELIGIBILITY_PAYLOAD = "05b9d74d3b2ae0c8166d50eb5ee79000ba51341a7d8356ddda43a3fc627b1588";
const TRAINING_MANIFEST_SHA = "b0465888ae65fa085c5b05b330f4241b0c0bf8f8f99562da9e2a4c88fb136e56";
const T3A_SERVICE_SHA = "3fe88fdeefc05c555dc084c18c504d89ab0c6bb7b7deea97fd6512865a70095b";
export const ABSOLUTE_LOGIT_MARGIN_BANDS = ["[0,0.25)", "[0.25,0.5)", "[0.5,1)", "[1,+inf)"] as const;
export const EVIDENCE_STATUSES = ["SUPPORTED_FOR_FUTURE_DESIGN", "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", "NOT_SUPPORTED_BY_CURRENT_EVIDENCE", "NOT_CURRENTLY_FEASIBLE_WITH_EXISTING_AUTHORIZED_DATA"] as const;

type JsonRecord = Record<string, any>;
export interface DiagnosticPaths {
  readonly certification: string; readonly evaluationManifest: string; readonly internalPredictions: string; readonly benchmarkPredictions: string;
  readonly train: string; readonly validation: string; readonly materialization: string; readonly trainingReady: string; readonly release: string; readonly eligibility: string;
  readonly trainingManifest: string; readonly internalFreeze: string; readonly benchmarkSource: string; readonly candidate: string; readonly tokenizer: string; readonly tokenizerBinding: string; readonly t3aService: string;
}
export interface DescriptiveStatistics { readonly count: number; readonly min: number; readonly max: number; readonly mean: number; readonly p25: number; readonly median: number; readonly p75: number; readonly percentileMethod: "LINEAR_INTERPOLATION_R7" }

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const exact = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8E-A ${label} mismatch`); };
const readJson = (filename: string): JsonRecord => JSON.parse(fs.readFileSync(filename, "utf8")) as JsonRecord;
const assertSha = (filename: string, expected: string, label: string): void => { if (sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8E-A ${label} SHA-256 mismatch`); };
const readJsonl = (filename: string): JsonRecord[] => fs.readFileSync(filename, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line) as JsonRecord);
const rounded = (value: number): number => Number(value.toFixed(12));
const percentile = (sorted: readonly number[], fraction: number): number => { const position = (sorted.length - 1) * fraction, low = Math.floor(position), high = Math.ceil(position); return sorted[low] + (sorted[high] - sorted[low]) * (position - low); };
export const descriptiveStatistics = (values: readonly number[]): DescriptiveStatistics => {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error("T6L-8E-A descriptive statistics require finite values");
  const sorted = [...values].sort((left, right) => left - right); return { count: sorted.length, min: rounded(sorted[0]), max: rounded(sorted[sorted.length - 1]), mean: rounded(sorted.reduce((sum, value) => sum + value, 0) / sorted.length), p25: rounded(percentile(sorted, .25)), median: rounded(percentile(sorted, .5)), p75: rounded(percentile(sorted, .75)), percentileMethod: "LINEAR_INTERPOLATION_R7" };
};
export const boundaryBands = (rows: readonly PredictionRecord[]): Readonly<Record<typeof ABSOLUTE_LOGIT_MARGIN_BANDS[number], number>> => {
  const result: Record<typeof ABSOLUTE_LOGIT_MARGIN_BANDS[number], number> = { "[0,0.25)": 0, "[0.25,0.5)": 0, "[0.5,1)": 0, "[1,+inf)": 0 };
  rows.forEach((row) => { const margin = Math.abs(row.blockLogit - row.allowLogit); result[margin < .25 ? "[0,0.25)" : margin < .5 ? "[0.25,0.5)" : margin < 1 ? "[0.5,1)" : "[1,+inf)"] += 1; }); return result;
};
const statistics = (rows: readonly PredictionRecord[]): JsonRecord => ({ allowLogit: descriptiveStatistics(rows.map((row) => row.allowLogit)), blockLogit: descriptiveStatistics(rows.map((row) => row.blockLogit)), logitMargin: descriptiveStatistics(rows.map((row) => row.blockLogit - row.allowLogit)), allowScore: descriptiveStatistics(rows.map((row) => row.allowScore)), blockScore: descriptiveStatistics(rows.map((row) => row.blockScore)), scoreMargin: descriptiveStatistics(rows.map((row) => row.blockScore - row.allowScore)) });
const selectedGroups = (rows: readonly PredictionRecord[]): Readonly<Record<string, readonly PredictionRecord[]>> => ({ all: rows, expectedAllow: rows.filter((row) => row.trueTarget === 0), expectedBlock: rows.filter((row) => row.trueTarget === 1), correct: rows.filter((row) => row.correct), incorrect: rows.filter((row) => !row.correct), truePositive: rows.filter((row) => row.trueTarget === 1 && row.predictedTarget === 1), trueNegative: rows.filter((row) => row.trueTarget === 0 && row.predictedTarget === 0), falsePositive: rows.filter((row) => row.trueTarget === 0 && row.predictedTarget === 1), falseNegative: rows.filter((row) => row.trueTarget === 1 && row.predictedTarget === 0) });
export const scoreDiagnostics = (rows: readonly PredictionRecord[]): JsonRecord => Object.fromEntries(Object.entries(selectedGroups(rows)).map(([name, group]) => [name, { statistics: statistics(group), absoluteLogitMarginBands: boundaryBands(group) }]));
const counts = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
const groupRows = (rows: readonly PredictionRecord[], key: string): Readonly<Record<string, readonly PredictionRecord[]>> => Object.fromEntries([...new Set(rows.map((row) => String(row.metadata[key] ?? "NONE")))].sort().map((value) => [value, rows.filter((row) => String(row.metadata[key] ?? "NONE") === value)]));
const diagnosticGroup = (rows: readonly PredictionRecord[]): JsonRecord => ({ metrics: metricValues(rows.map((row) => row.trueTarget), rows.map((row) => row.predictedTarget)), scoreDiagnostics: statistics(rows), incorrectBoundaryBands: boundaryBands(rows.filter((row) => !row.correct)), incorrectCount: rows.filter((row) => !row.correct).length });
const groupDiagnostics = (rows: readonly PredictionRecord[], key: string): JsonRecord => Object.fromEntries(Object.entries(groupRows(rows, key)).map(([name, group]) => [name, diagnosticGroup(group)]));
const errorProfile = (rows: readonly PredictionRecord[], kind: "FALSE_POSITIVE" | "FALSE_NEGATIVE"): JsonRecord => {
  const selected = rows.filter((row) => kind === "FALSE_POSITIVE" ? row.trueTarget === 0 && row.predictedTarget === 1 : row.trueTarget === 1 && row.predictedTarget === 0), tags = selected.flatMap((row) => row.metadata.tags as string[]);
  return { count: selected.length, ids: selected.map((row) => row.exampleId), difficulty: counts(selected.map((row) => String(row.metadata.difficulty))), language: counts(selected.map((row) => String(row.metadata.language))), expectedCategory: counts(selected.map((row) => String(row.metadata.expectedCategory ?? "NONE"))), tags: counts(tags), statistics: statistics(selected), absoluteLogitMarginBands: boundaryBands(selected) };
};

export const defaultMhsV2PostEvaluationDiagnosticPaths = (root = process.cwd()): DiagnosticPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), evaluation = path.resolve(root, "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1"), training = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"), cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089");
  return { certification: path.join(mhs, "training/mhs-v2-first-controlled-evaluation-certification-v1.json"), evaluationManifest: path.join(evaluation, "run/run-manifest.json"), internalPredictions: path.join(evaluation, "internal-test/predictions.jsonl"), benchmarkPredictions: path.join(evaluation, "external-benchmark/predictions.jsonl"), train: path.join(mhs, "materialized/mhs-train-v2.jsonl"), validation: path.join(mhs, "materialized/mhs-validation-v2.jsonl"), materialization: path.join(mhs, "materialized/mhs-materialization-manifest-v2.json"), trainingReady: path.join(mhs, "materialized/mhs-training-ready-certification-v2.json"), release: path.join(mhs, "release/mhs-release-manifest-v2.json"), eligibility: path.join(mhs, "release/mhs-training-eligibility-manifest-v2.json"), trainingManifest: path.join(training, "run/run-manifest.json"), internalFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), benchmarkSource: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts"), candidate: path.join(training, "final/model.safetensors"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerBinding: path.join(training, "final/tokenizer-binding.json"), t3aService: path.resolve(root, "src/services/textModeration/textModeration.service.ts") };
};

export const createMhsV2PostEvaluationDiagnostic = (paths: DiagnosticPaths): JsonRecord => {
  const pinned: readonly [string, string, string][] = [[paths.certification, CERTIFICATION_SHA, "8D-D certification"], [paths.evaluationManifest, EVALUATION_MANIFEST_SHA, "evaluation manifest"], [paths.candidate, CANDIDATE_SHA, "candidate"], [paths.tokenizer, TOKENIZER_SHA, "tokenizer"], [paths.tokenizerBinding, TOKENIZER_BINDING_SHA, "tokenizer binding"], [paths.train, TRAIN_SHA, "TRAIN"], [paths.validation, VALIDATION_SHA, "VALIDATION"], [paths.materialization, MATERIALIZATION_SHA, "materialization"], [paths.trainingReady, TRAINING_READY_SHA, "training-ready"], [paths.release, RELEASE_SHA, "release"], [paths.eligibility, ELIGIBILITY_SHA, "eligibility"], [paths.trainingManifest, TRAINING_MANIFEST_SHA, "training manifest"], [paths.internalFreeze, INTERNAL_FREEZE_SHA, "INTERNAL_TEST freeze"], [paths.benchmarkSource, BENCHMARK_SHA, "benchmark"], [paths.t3aService, T3A_SERVICE_SHA, "T3A service"]]; pinned.forEach(([filename, expected, label]) => assertSha(filename, expected, label));
  const certification = readJson(paths.certification), evaluationManifest = readJson(paths.evaluationManifest), trainingManifest = readJson(paths.trainingManifest), materialization = readJson(paths.materialization), trainingReady = readJson(paths.trainingReady), release = readJson(paths.release), eligibility = readJson(paths.eligibility);
  exact([certification.status, certification.certificationPayloadDigest], ["CONTROLLED_EVALUATION_CERTIFIED", CERTIFICATION_PAYLOAD], "8D-D identity"); exact([evaluationManifest.runPayloadDigest, evaluationManifest.terminalStatus], [EVALUATION_MANIFEST_PAYLOAD, "COMPLETED"], "evaluation identity");
  exact([materialization.status, materialization.materializationPayloadDigest], ["IMMUTABLE_AUTHORIZED_TRAIN_VALIDATION_MATERIALIZATION", MATERIALIZATION_PAYLOAD], "materialization identity");
  exact([trainingReady.status, trainingReady.certificationPayloadDigest], ["TRAINING_READY_AUTHORIZED", TRAINING_READY_PAYLOAD], "training-ready identity");
  exact([release.status, release.releasePayloadDigest], ["COMBINED_DATASET_RELEASE_AUTHORIZED", RELEASE_PAYLOAD], "release identity");
  exact([eligibility.status, eligibility.eligibilityPayloadDigest], ["EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY", ELIGIBILITY_PAYLOAD], "eligibility identity");
  const internal = readPredictionJsonl(paths.internalPredictions), benchmark = readPredictionJsonl(paths.benchmarkPredictions), train = readJsonl(paths.train), validation = readJsonl(paths.validation);
  if (internal.length !== 13 || benchmark.length !== 140 || train.length !== 200 || validation.length !== 13) throw new Error("T6L-8E-A population count mismatch");
  const trainDecision = counts(train.map((row) => String(row.decision))), trainOrigin = counts(train.map((row) => String(row.origin))), trainLanguage = counts(train.map((row) => String(row.language))), trainScript = counts(train.map((row) => String(row.script))), trainSource = counts(train.map((row) => String(row.sourceDataset))), trainBlock = train.filter((row) => row.decision === "BLOCK"), trainCategories = counts(trainBlock.map((row) => String(row.primaryCategory)));
  exact([trainDecision, trainOrigin, trainLanguage, trainScript, trainSource, trainCategories], [{ ALLOW: 110, BLOCK: 90 }, { HISTORICAL_MHS_V1: 60, MHS_V2_EXPANSION: 140 }, { en: 200 }, { LATIN: 200 }, { MEASURING_HATE_SPEECH: 200 }, { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 }], "TRAIN composition");
  exact(counts(validation.map((row) => String(row.decision))), { ALLOW: 9, BLOCK: 4 }, "VALIDATION composition");
  const benchmarkBlock = benchmark.filter((row) => row.trueTarget === 1), benchmarkCategory = counts(benchmarkBlock.map((row) => String(row.metadata.expectedCategory))), benchmarkLanguage = counts(benchmark.map((row) => String(row.metadata.language))), benchmarkDifficulty = counts(benchmark.map((row) => String(row.metadata.difficulty)));
  const categoryDiagnostics = groupDiagnostics(benchmarkBlock, "expectedCategory"), difficultyDiagnostics = groupDiagnostics(benchmark, "difficulty"), languageDiagnostics = groupDiagnostics(benchmark, "language"), internalScores = scoreDiagnostics(internal), benchmarkScores = scoreDiagnostics(benchmark), falsePositives = errorProfile(benchmark, "FALSE_POSITIVE"), falseNegatives = errorProfile(benchmark, "FALSE_NEGATIVE");
  const epochs = trainingManifest.epochs as JsonRecord[]; exact(epochs.map((row) => [row.epoch, row.trainingLoss, row.validationLoss, row.macroF1]), [[1, .7163, .5413439869880676, .40909090909090906], [2, .6597, .5359475612640381, .7067669172932332], [3, .6149, .5064834952354431, .7833333333333333]], "training dynamics");
  const certifiedSources = certification.sourceResults as JsonRecord;
  exact([certifiedSources.INTERNAL_TEST.metrics.confusionMatrix, certifiedSources.EXTERNAL_BENCHMARK.metrics.confusionMatrix], [[[8, 1], [1, 3]], [[36, 31], [38, 35]]], "certified baseline confusion matrices");
  const payload: JsonRecord = {
    schemaVersion: MHS_V2_POST_EVALUATION_DIAGNOSTIC_SCHEMA, diagnosticVersion: MHS_V2_POST_EVALUATION_DIAGNOSTIC_VERSION, phase: "T6L-8E-A", status: "POST_EVALUATION_DIAGNOSTIC_COMPLETE",
    authorities: { evaluationCertification: { sha256: CERTIFICATION_SHA, payloadDigest: CERTIFICATION_PAYLOAD }, evaluationRunManifest: { sha256: EVALUATION_MANIFEST_SHA, payloadDigest: EVALUATION_MANIFEST_PAYLOAD }, candidateSha256: CANDIDATE_SHA, tokenizerSha256: TOKENIZER_SHA, tokenizerBindingSha256: TOKENIZER_BINDING_SHA, train: { sha256: TRAIN_SHA, payloadDigest: TRAIN_PAYLOAD, membershipDigest: TRAIN_MEMBERSHIP }, validation: { sha256: VALIDATION_SHA, payloadDigest: VALIDATION_PAYLOAD, membershipDigest: VALIDATION_MEMBERSHIP }, materializationSha256: MATERIALIZATION_SHA, trainingReadySha256: TRAINING_READY_SHA, releaseSha256: RELEASE_SHA, eligibilitySha256: ELIGIBILITY_SHA, trainingRunManifestSha256: TRAINING_MANIFEST_SHA, internalTestFreezeSha256: INTERNAL_FREEZE_SHA, benchmark: { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: BENCHMARK_SHA }, t3aModerationServiceSha256: T3A_SERVICE_SHA },
    certifiedBaseline: { INTERNAL_TEST: certifiedSources.INTERNAL_TEST.metrics, EXTERNAL_BENCHMARK: certifiedSources.EXTERNAL_BENCHMARK.metrics, pooledAuthoritativeMetric: null, productionThresholdStatus: "NOT_SELECTED" },
    methodology: { scoreSemantics: "UNCALIBRATED_MODEL_SCORES", signedLogitMargin: "BLOCK_LOGIT_MINUS_ALLOW_LOGIT", signedScoreMargin: "BLOCK_SCORE_MINUS_ALLOW_SCORE", percentileMethod: "LINEAR_INTERPOLATION_R7", absoluteLogitMarginBands: ABSOLUTE_LOGIT_MARGIN_BANDS, bandsFrozenBeforeDiagnosticComputation: true, thresholdOptimizationPerformed: false },
    scoreAndMarginDiagnostics: { INTERNAL_TEST: internalScores, EXTERNAL_BENCHMARK: benchmarkScores },
    errorDiagnostics: { falsePositives, falseNegatives }, categoryDiagnostics, difficultyDiagnostics, languageDiagnostics,
    trainComposition: { rows: 200, labels: trainDecision, origin: trainOrigin, language: trainLanguage, script: trainScript, sourceDataset: trainSource, blockPrimaryCategory: trainCategories, difficultyMetadata: "ABSENT", benchmarkStyleTags: "ABSENT", domainMetadata: "ABSENT" },
    benchmarkComposition: { rows: 140, labels: { ALLOW: 67, BLOCK: 73 }, language: benchmarkLanguage, difficulty: benchmarkDifficulty, blockExpectedCategory: benchmarkCategory },
    compositionComparisons: {
      labels: { status: "SUPPORTED_COMPARISON", finding: "TRAIN_IS_55_PERCENT_ALLOW_45_PERCENT_BLOCK; BENCHMARK_IS_47_9_PERCENT_ALLOW_52_1_PERCENT_BLOCK" },
      blockCategory: { status: "SUPPORTED_COMPARISON", finding: "TRAIN_HAS_NO_OTHER_INAPPROPRIATE_PRIMARY_AND_LOWER_THREAT_SHARE; ABUSIVE_AND_HATE_HAVE_NONTRIVIAL_TRAIN_COUNTS_BUT_VERY_LOW_BENCHMARK_RECALL" },
      language: { status: "SUPPORTED_COMPARISON", finding: "TRAIN_IS_200_OF_200_EN_LATIN; BENCHMARK_HAS_25_NON_EN_OR_MULTILINGUAL_ROWS" },
      sourceAndDomain: { status: "NOT_COMPARABLE", finding: "TRAIN_SOURCE_IDENTITY_AND_BENCHMARK_PRODUCT_DOMAIN_ARE_DIFFERENT_TAXONOMIES" },
      difficulty: { status: "NOT_COMPARABLE", finding: "TRAIN_HAS_NO_DIFFICULTY_METADATA" },
      tags: { status: "NOT_COMPARABLE", finding: "TRAIN_HAS_POLICY_CATEGORIES_AND_REASON_CODES_BUT_NOT_BENCHMARK_STYLE_TAGS" },
    },
    validationComparison: { validation: { rows: 13, confusionMatrix: [[9, 0], [2, 2]], accuracy: .8461538461538461, blockPrecision: 1, blockRecall: .5, blockF1: .6666666666666666, macroF1: .7833333333333333, balancedAccuracy: .75, warning: "VALIDATION_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE" }, internalTest: certifiedSources.INTERNAL_TEST.metrics, benchmark: certifiedSources.EXTERNAL_BENCHMARK.metrics, finding: "VALIDATION_AND_INTERNAL_TEST_ARE_BOTH_13_ROW_HIGH_VARIANCE_SAMPLES; THEIR_STRONGER_RESULTS_DO_NOT_GENERALIZE_TO_THE_LARGER_FIXED_BENCHMARK", statisticalCertaintyClaimed: false },
    trainingDynamics: { epochs: epochs.map((row) => ({ epoch: row.epoch, trainingLoss: row.trainingLoss, validationLoss: row.validationLoss, validationMacroF1: row.macroF1 })), finding: "LOSSES_AND_SMALL_VALIDATION_MACRO_F1_IMPROVED_THROUGH_EPOCH_3", optimizationUnderfittingStatus: "POSSIBLE_NOT_ESTABLISHED", moreEpochsAuthorized: false, reason: "THE_13_ROW_VALIDATION_SET_IS_TOO_SMALL_TO_JUSTIFY_MORE_EPOCHS_AND_PROTECTED_BENCHMARK_RESULTS_CANNOT_BE_A_TUNING_TARGET" },
    diagnosticQuestions: {
      A: { conclusion: "GLOBAL_OPERATING_POINT_IS_A_PARTIAL_NOT_PRIMARY_EXPLANATION", evidence: ["ALL_31_FALSE_POSITIVES_HAVE_ABSOLUTE_LOGIT_MARGIN_BELOW_0_25", "20_OF_38_FALSE_NEGATIVES_HAVE_ABSOLUTE_LOGIT_MARGIN_AT_LEAST_0_25"] },
      B: { conclusion: "CATEGORY_DEPENDENT_GENERALIZATION_GAP_SUPPORTED", evidence: ["BLOCK_RECALL_RANGES_FROM_0_OF_11_ABUSIVE_TO_17_OF_18_SEXUAL", "FALSE_NEGATIVE_MARGIN_DISTRIBUTIONS_DIFFER_BY_CATEGORY"] },
      C: { conclusion: "SCORE_AND_LOGIT_GROUP_DISTRIBUTIONS_COMPUTED", evidence: ["PERSISTED_LOGITS_AND_UNCALIBRATED_SCORES_ONLY"] },
      D: { conclusion: "AUTHORIZED_CATEGORY_DIFFICULTY_LANGUAGE_DISTRIBUTIONS_COMPUTED", evidence: ["NO_RAW_TEXT_USED"] },
      E: { conclusion: "FALSE_POSITIVES_ARE_BOUNDARY_CLOSE_BUT_FALSE_NEGATIVES_ARE_MIXED", evidence: ["FP_BANDS_31_0_0_0", "FN_BANDS_18_11_7_2"] },
      F: { conclusion: "PARTIAL_CATEGORY_COMPOSITION_MISALIGNMENT_SUPPORTED", evidence: ["TRAIN_OTHER_INAPPROPRIATE_ZERO", "TRAIN_THREAT_SHARE_15_OF_90_VS_BENCHMARK_25_OF_73", "ABUSIVE_AND_HATE_FAILURES_NOT_EXPLAINED_BY_ZERO_COUNTS"] },
      G: { conclusion: "LANGUAGE_COMPOSITION_MISALIGNMENT_SUPPORTED", evidence: ["TRAIN_200_OF_200_EN_LATIN", "BENCHMARK_25_OF_140_NON_EN_OR_MULTILINGUAL"] },
      H: { conclusion: "NOT_COMPARABLE", evidence: ["TRAIN_DIFFICULTY_AND_CONTEXT_TAG_METADATA_ABSENT"] },
      I: { conclusion: "CONCEPT_STRENGTH_DIFFERENCES_SUPPORTED", evidence: ["SEXUAL_RECALL_17_OF_18", "ABUSIVE_RECALL_0_OF_11", "HATE_RECALL_1_OF_10"] },
      J: { conclusion: "BINARY_ONLY_SUPERVISION_LIMITATION_IS_PLAUSIBLE_NOT_CAUSALLY_PROVEN", evidence: ["TRAIN_BLOCK_CATEGORY_METADATA_EXISTS_BUT_OBJECTIVE_WAS_BINARY", "LARGE_CATEGORY_RECALL_DISPARITY"] },
      K: { conclusion: "CHANGED_OPTIMIZATION_ONLY_IS_PLAUSIBLE_BUT_UNJUSTIFIED", evidence: ["EPOCH_3_STILL_IMPROVED", "VALIDATION_ONLY_13_ROWS", "NO_NONPROTECTED_TUNING_TARGET_FOR_BENCHMARK_GAPS"] },
      L: { conclusion: "SAME_DATA_RERUN_LACKS_A_CLEAR_ESTABLISHED_MECHANISM", evidence: ["CURRENT_EVIDENCE_DOES_NOT_ISOLATE_HYPERPARAMETER_CAUSALITY"] },
      M: { conclusion: "THRESHOLD_ANALYSIS_WORTH_INVESTIGATING_BUT_LIMITED", evidence: ["ALL_FALSE_POSITIVES_BOUNDARY_CLOSE", "MANY_FALSE_NEGATIVES_SUBSTANTIALLY_WRONG_SIDE", "NO_THRESHOLD_SELECTED"] },
      N: { conclusion: "MULTIPLE_CAUSAL_AND_SEMANTIC_CONCLUSIONS_UNSUPPORTED", evidence: ["NO_RAW_ERROR_REVIEW", "NO_TRAIN_DIFFICULTY_TAG_DOMAIN_METADATA", "NO_CALIBRATION STUDY", "NO_FULL_STACK_EVALUATION"] },
    },
    deterministicRuleContext: { benchmarkScope: "CLASSIFIER_ONLY", productionDeterministicCoverage: "SYNTHETIC_PROHIBITED_FIXTURE_ONLY", meaningfulRealPolicyClassCoverage: [], semanticProviderProductionStatus: "UNAVAILABLE_BY_DEFAULT", fullStackPerformanceMeasured: false, finding: "CURRENT_T3A_DETERMINISTIC_RULES_DO_NOT_MATERIALLY_EXPLAIN_OR_OFFSET_CERTIFIED_CLASSIFIER_CATEGORY_GAPS" },
    futurePathDecisionMatrix: [
      { path: "A_THRESHOLD_OR_CALIBRATION_INVESTIGATION", evidenceStatus: "SUPPORTED_FOR_FUTURE_DESIGN", supportingEvidence: ["31_OF_31_FALSE_POSITIVES_WITHIN_0_25_LOGIT_MARGIN", "18_OF_38_FALSE_NEGATIVES_WITHIN_0_25"], limitations: ["NO_THRESHOLD_MAY_BE_SELECTED_FROM_PROTECTED_RESULTS", "20_FALSE_NEGATIVES_ARE_AT_LEAST_0_25_WRONG_SIDE"] },
      { path: "B_SAME_DATA_CHANGED_OPTIMIZATION", evidenceStatus: "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", supportingEvidence: ["TRAIN_AND_VALIDATION_LOSS_IMPROVED_THROUGH_EPOCH_3"], limitations: ["VALIDATION_HAS_13_ROWS", "NO_CAUSAL_HYPERPARAMETER_DIAGNOSIS"] },
      { path: "C_EXISTING_TRAIN_REBALANCING_OR_RESAMPLING", evidenceStatus: "SUPPORTED_FOR_FUTURE_DESIGN", supportingEvidence: ["EXISTING_TRAIN_HAS_BLOCK_CATEGORY_METADATA", "THREAT_SHARE_AND_OTHER_INAPPROPRIATE_COVERAGE_DIFFER_FROM_BENCHMARK", "NO_NEW_DATA_REQUIRED"], limitations: ["PROTECTED_BENCHMARK_MUST_NOT_BECOME_A_TUNING_TARGET"] },
      { path: "D_EXISTING_CATEGORY_AUXILIARY_OR_MULTITASK_SUPERVISION", evidenceStatus: "SUPPORTED_FOR_FUTURE_DESIGN", supportingEvidence: ["ALL_90_TRAIN_BLOCK_ROWS_HAVE_PRIMARY_CATEGORY", "CATEGORY_DEPENDENT_RECALL_GAP"], limitations: ["BINARY_SUPERVISION_CAUSALITY_NOT_PROVEN", "ALLOW_ROWS_HAVE_NO_BLOCK_CATEGORY"] },
      { path: "E_HYBRID_DETERMINISTIC_RULES_AND_SEMANTIC_MODEL", evidenceStatus: "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", supportingEvidence: ["ARCHITECTURE_HAS_DETERMINISTIC_PRE_PROVIDER_STAGE"], limitations: ["CURRENT_REAL_POLICY_RULE_COVERAGE_IS_EMPTY", "NO_FULL_STACK_BENCHMARK"] },
      { path: "F_EVALUATE_EXISTING_FULL_MODERATION_STACK_FIRST", evidenceStatus: "NOT_SUPPORTED_BY_CURRENT_EVIDENCE", supportingEvidence: ["CERTIFIED_RUN_IS_CLASSIFIER_ONLY"], limitations: ["PRODUCTION_PROVIDER_IS_UNAVAILABLE_BY_DEFAULT", "DETERMINISTIC_RULE_IS_SYNTHETIC_ONLY", "SECOND_PROTECTED_BENCHMARK_RUN_NOT_AUTHORIZED"] },
      { path: "G_DEFER_FURTHER_TRAINING_DUE_TO_DATA_LIMITATION", evidenceStatus: "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", supportingEvidence: ["TRAIN_IS_SMALL_SINGLE_SOURCE_AND_EN_ONLY", "TRAIN_LACKS_DIFFICULTY_DOMAIN_TAG_METADATA"], limitations: ["EXISTING_CATEGORY_METADATA_STILL_SUPPORTS_UNTRIED_DESIGNS", "NEW_DATA_COLLECTION_NOT_AUTHORIZED"] },
    ],
    unsupportedConclusions: ["OPTIMAL_OR_PRODUCTION_THRESHOLD", "CALIBRATED_PROBABILITY_OR_CONFIDENCE", "INDIVIDUAL_ERROR_SEMANTIC_CAUSE", "STATISTICAL_GENERALIZATION_CERTAINTY", "CAUSAL_OPTIMIZATION_UNDERFITTING", "TRAIN_DIFFICULTY_OR_BENCHMARK_TAG_ALIGNMENT", "PRODUCTION_FULL_STACK_PERFORMANCE", "MODEL_PRODUCTION_APPROVAL_OR_REJECTION"],
    limitations: ["INTERNAL_TEST_AND_VALIDATION_EACH_HAVE_13_ROWS", "BENCHMARK_IS_FIXED_PROTECTED_EVALUATION_EVIDENCE", "TRAIN_HAS_200_SINGLE_SOURCE_EN_LATIN_ROWS", "NO_PROTECTED_RAW_TEXT_ERROR_REVIEW", "NO_NEW_DATA_OR_LABELS", "SCORES_ARE_UNCALIBRATED", "PROTECTED_RESULTS_MUST_NOT_BE_USED_AS_A_TUNING_TARGET"],
    boundaries: { modelLoads: 0, forwardPasses: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, trainingRuns: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0, newTrainingExamples: 0, newLabels: 0, productionChanges: 0, productionThresholdStatus: "NOT_SELECTED" },
    analyzedAt: certification.certifiedAt,
  };
  const artifact = { ...payload, diagnosticPayloadDigest: digest(payload) }; validateMhsV2PostEvaluationDiagnostic(artifact); return artifact;
};

export const validateMhsV2PostEvaluationDiagnostic = (artifact: JsonRecord): void => {
  const payload = { ...artifact }, payloadDigest = payload.diagnosticPayloadDigest; delete payload.diagnosticPayloadDigest;
  if (artifact.schemaVersion !== MHS_V2_POST_EVALUATION_DIAGNOSTIC_SCHEMA || artifact.diagnosticVersion !== MHS_V2_POST_EVALUATION_DIAGNOSTIC_VERSION || artifact.phase !== "T6L-8E-A" || artifact.status !== "POST_EVALUATION_DIAGNOSTIC_COMPLETE" || payloadDigest !== digest(payload)) throw new Error("Invalid T6L-8E-A identity/payload");
  if (payloadDigest !== MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8E-A pinned payload");
  exact(artifact.boundaries, { exclusionUses: 0, forwardPasses: 0, modelLoads: 0, newLabels: 0, newProtectedInference: 0, newTrainingExamples: 0, productionChanges: 0, productionThresholdStatus: "NOT_SELECTED", protectedRawTextAccesses: 0, reserveUses: 0, thresholdSelections: 0, trainingRuns: 0 }, "boundaries");
  if (artifact.certifiedBaseline.pooledAuthoritativeMetric !== null || artifact.methodology.thresholdOptimizationPerformed !== false || artifact.futurePathDecisionMatrix.length !== 7 || artifact.futurePathDecisionMatrix.some((row: JsonRecord) => !EVIDENCE_STATUSES.includes(row.evidenceStatus))) throw new Error("Invalid T6L-8E-A diagnostic boundary/matrix");
  if (/"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("T6L-8E-A protected/development raw text prohibited");
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2PostEvaluationDiagnostic = (artifact: JsonRecord, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2PostEvaluationDiagnostic(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_POST_EVALUATION_DIAGNOSTIC_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8E-A diagnostic exists; overwrite refused"); const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8E-A publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
