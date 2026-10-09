import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
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
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256,
  validateMhsV2ControlledEvaluationCertification,
} from "./mhsV2ControlledEvaluationCertification";
import {
  MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST,
  MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256,
  validateMhsV2PostEvaluationDiagnostic,
} from "./mhsV2PostEvaluationDiagnostic";
import {
  MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_STRATEGY_SHA256,
  validateMhsV2SuccessorStrategy,
} from "./mhsV2SuccessorTrainingContract";
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

export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_V1" as const;
export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_VERSION = "MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_V1" as const;
export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FILENAME = "mhs-v2-successor-evaluation-methodology-v1.json" as const;
export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256 = "62031d2a99fd89eb0280f15d3a96d740bd277422de4b271e30d61ef597377865";
export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST = "aacdb93598825d9e5797441049daa8906a9cabd6438b15eb330c890d31eeaa54";
export const MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FROZEN_AT = "2026-09-30T00:00:00.000Z" as const;

const INTERNAL_TEST_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const INTERNAL_TEST_PAYLOAD = "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb";
const INTERNAL_TEST_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const SELECTED_MODEL_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
type Json = Record<string, any>;

export interface MhsV2SuccessorEvaluationMethodologyPaths {
  readonly controlledContract: string; readonly controlledPreparation: string; readonly firstEvaluationCertification: string;
  readonly diagnostic: string; readonly strategy: string; readonly successorCertification: string; readonly d0: string; readonly waiver: string; readonly internalTestFreeze: string;
}
export interface MhsV2SuccessorEvaluationMethodologyArtifact {
  readonly schemaVersion: typeof MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SCHEMA; readonly methodologyVersion: typeof MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_VERSION;
  readonly phase: "T6L-8F-A"; readonly status: "CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED";
  readonly authorities: Json; readonly provenanceWaiverDisclosure: Json; readonly exposureHistory: Json; readonly influenceFinding: Json; readonly classification: Json;
  readonly sourceRoles: Json; readonly reuseControl: Json; readonly comparison: Json; readonly metrics: Json;
  readonly analyses: Json; readonly statisticalPolicy: Json; readonly auxiliaryHeadPolicy: Json; readonly inferenceContract: Json;
  readonly privacy: Json; readonly scoreSemantics: Json; readonly thresholdPolicy: Json; readonly interpretation: Json;
  readonly futureConsequences: Json; readonly executionPlan: Json; readonly boundaries: Readonly<Record<string, number>>;
  readonly frozenAt: typeof MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FROZEN_AT; readonly methodologyPayloadDigest: string;
}

export const defaultMhsV2SuccessorEvaluationMethodologyPaths = (root = process.cwd()): MhsV2SuccessorEvaluationMethodologyPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), training = path.join(mhs, "training");
  return { controlledContract: path.join(training, "mhs-v2-controlled-evaluation-contract-v1.json"), controlledPreparation: path.join(training, "mhs-v2-controlled-evaluation-runner-preparation-v1.json"), firstEvaluationCertification: path.join(training, "mhs-v2-first-controlled-evaluation-certification-v1.json"), diagnostic: path.join(training, "mhs-v2-post-evaluation-diagnostic-analysis-v1.json"), strategy: path.join(training, "mhs-v2-successor-training-strategy-analysis-v1.json"), successorCertification: path.join(training, "mhs-v2-successor-local-training-run-certification-v1.json"), d0: path.join(training, "mhs-v2-successor-training-provenance-recovery-v1.json"), waiver: path.join(training, "mhs-v2-successor-training-provenance-waiver-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json") };
};
const read = (filename: string): Json => JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
const exactSha = (filename: string, expected: string, label: string): void => { if (!fs.existsSync(filename) || sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8F-A ${label} SHA mismatch`); };
const same = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8F-A ${label} mismatch`); };

export const createMhsV2SuccessorEvaluationMethodology = (paths: MhsV2SuccessorEvaluationMethodologyPaths): MhsV2SuccessorEvaluationMethodologyArtifact => {
  [[paths.controlledContract, MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, "8D-A contract"], [paths.controlledPreparation, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256, "8D-B preparation"], [paths.firstEvaluationCertification, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256, "8D-D certification"], [paths.diagnostic, MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256, "8E-A diagnostic"], [paths.strategy, MHS_V2_SUCCESSOR_STRATEGY_SHA256, "8E-B strategy"], [paths.successorCertification, MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, "8E-D certification"], [paths.d0, MHS_V2_SUCCESSOR_PROVENANCE_SHA256, "D0"], [paths.waiver, MHS_V2_SUCCESSOR_WAIVER_SHA256, "D0W"], [paths.internalTestFreeze, INTERNAL_TEST_SHA, "INTERNAL_TEST freeze"]].forEach(([file, hash, label]) => exactSha(file, hash, label));
  const contract = read(paths.controlledContract), preparation = read(paths.controlledPreparation), first = read(paths.firstEvaluationCertification), diagnostic = read(paths.diagnostic), strategy = read(paths.strategy), successor = read(paths.successorCertification), d0 = read(paths.d0), waiver = read(paths.waiver), internalFreeze = read(paths.internalTestFreeze);
  validateMhsV2ControlledEvaluationContract(contract as Parameters<typeof validateMhsV2ControlledEvaluationContract>[0]); validateMhsV2ControlledEvaluationPreparation(preparation as Parameters<typeof validateMhsV2ControlledEvaluationPreparation>[0]); validateMhsV2ControlledEvaluationCertification(first); validateMhsV2PostEvaluationDiagnostic(diagnostic); validateMhsV2SuccessorStrategy(strategy); validateMhsV2SuccessorLocalTrainingCertification(successor as Parameters<typeof validateMhsV2SuccessorLocalTrainingCertification>[0]); validateMhsV2SuccessorProvenanceRecovery(d0 as Parameters<typeof validateMhsV2SuccessorProvenanceRecovery>[0]); validateMhsV2SuccessorTrainingProvenanceWaiver(waiver as Parameters<typeof validateMhsV2SuccessorTrainingProvenanceWaiver>[0]);
  same([contract.contractPayloadDigest, preparation.preparationPayloadDigest, first.certificationPayloadDigest, diagnostic.diagnosticPayloadDigest, strategy.strategyPayloadDigest, successor.certificationPayloadDigest], [MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST, MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST, MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST], "payload authorities");
  same([internalFreeze.candidateCount, internalFreeze.freezePayloadDigest, internalFreeze.protectedMembershipDigest, internalFreeze.decisionComposition], [13, INTERNAL_TEST_PAYLOAD, INTERNAL_TEST_MEMBERSHIP, { ALLOW: 9, BLOCK: 4 }], "INTERNAL_TEST metadata");
  same([contract.authorities.externalBenchmark.sha256, contract.authorities.externalBenchmark.version, contract.authorities.externalBenchmark.count], [BENCHMARK_SHA, "STHN_TEXT_MODERATION_FIXTURES_V1R", 140], "benchmark metadata");
  const internal = first.sourceResults.INTERNAL_TEST.metrics, benchmark = first.sourceResults.EXTERNAL_BENCHMARK.metrics;
  same(internal, { accuracy: 0.8461538461538461, allowF1: 0.8888888888888888, allowPrecision: 0.8888888888888888, allowRecall: 0.8888888888888888, balancedAccuracy: 0.8194444444444444, blockF1: 0.75, blockPrecision: 0.75, blockRecall: 0.75, confusionMatrix: [[8, 1], [1, 3]], count: 13, groundTruthCounts: { ALLOW: 9, BLOCK: 4 }, macroF1: 0.8194444444444444, predictedCounts: { ALLOW: 9, BLOCK: 4 } }, "first INTERNAL_TEST metrics");
  same([benchmark.count, benchmark.confusionMatrix, benchmark.macroF1, benchmark.balancedAccuracy, benchmark.blockRecall], [140, [[36, 31], [38, 35]], 0.5071177100872494, 0.5083827438151707, 0.4794520547945205], "first benchmark metrics");
  const categories = first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.expectedCategory;
  same(Object.fromEntries(["ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"].map((key) => [key, [categories[key].count, categories[key].blockRecall]])), { ABUSIVE_OR_HARASSING: [11, 0], HATE: [10, 0.1], OTHER_INAPPROPRIATE: [5, 0.8], PROFANITY: [4, 0.25], SEXUAL: [18, 0.9444444444444444], THREAT_OR_VIOLENCE: [25, 0.48] }, "category results");
  const difficulty = first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.difficulty;
  same(Object.fromEntries(["ADVERSARIAL", "CONTEXTUAL", "EASY"].map((key) => [key, [difficulty[key].count, difficulty[key].accuracy, difficulty[key].macroF1]])), { ADVERSARIAL: [22, 0.5, 0.3333333333333333], CONTEXTUAL: [56, 0.6607142857142857, 0.6262732701088866], EASY: [62, 0.3709677419354839, 0.36684996072270226] }, "difficulty results");
  const language = first.sourceResults.EXTERNAL_BENCHMARK.breakdowns.language;
  same(Object.fromEntries(["en", "en-hi", "hi", "hi-Latn", "th"].map((key) => [key, [language[key].count, language[key].accuracy]])), { en: [115, 0.5130434782608696], "en-hi": [2, 0.5], hi: [10, 0.6], "hi-Latn": [4, 0.25], th: [9, 0.4444444444444444] }, "language results");
  same([diagnostic.scoreAndMarginDiagnostics.EXTERNAL_BENCHMARK.falsePositive.absoluteLogitMarginBands, diagnostic.scoreAndMarginDiagnostics.EXTERNAL_BENCHMARK.falseNegative.absoluteLogitMarginBands], [{ "[0,0.25)": 31, "[0.25,0.5)": 0, "[0.5,1)": 0, "[1,+inf)": 0 }, { "[0,0.25)": 18, "[0.25,0.5)": 11, "[0.5,1)": 7, "[1,+inf)": 2 }], "diagnostic influence");
  if (strategy.selectedStrategy !== "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING" || successor.status !== "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER" || successor.checkpoints.finalModelSha256 !== SELECTED_MODEL_SHA) throw new Error("T6L-8F-A successor authority mismatch");
  const commonMetrics = ["COUNT", "GROUND_TRUTH_COUNTS", "PREDICTED_COUNTS", "CONFUSION_MATRIX", "ACCURACY", "ALLOW_PRECISION", "ALLOW_RECALL", "ALLOW_F1", "BLOCK_PRECISION", "BLOCK_RECALL", "BLOCK_F1", "MACRO_F1", "BALANCED_ACCURACY", "FALSE_POSITIVES", "FALSE_NEGATIVES"];
  const payload = {
    schemaVersion: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SCHEMA, methodologyVersion: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_VERSION, phase: "T6L-8F-A" as const, status: "CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED" as const,
    authorities: { firstControlledEvaluationContract: { sha256: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_CONTRACT_PAYLOAD_DIGEST }, firstControlledEvaluationPreparation: { sha256: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_PREPARATION_PAYLOAD_DIGEST }, firstControlledEvaluationCertification: { sha256: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256, payloadDigest: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST, status: first.status }, postEvaluationDiagnostic: { sha256: MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256, payloadDigest: MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST, status: diagnostic.status }, successorStrategy: { sha256: MHS_V2_SUCCESSOR_STRATEGY_SHA256, payloadDigest: MHS_V2_SUCCESSOR_STRATEGY_PAYLOAD_DIGEST }, successorCertification: { sha256: MHS_V2_SUCCESSOR_CERTIFICATION_SHA256, payloadDigest: MHS_V2_SUCCESSOR_CERTIFICATION_PAYLOAD_DIGEST, status: successor.status, selectedModelSha256: SELECTED_MODEL_SHA }, provenanceRecovery: { sha256: MHS_V2_SUCCESSOR_PROVENANCE_SHA256, payloadDigest: MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST }, provenanceWaiver: { sha256: MHS_V2_SUCCESSOR_WAIVER_SHA256, payloadDigest: MHS_V2_SUCCESSOR_WAIVER_PAYLOAD_DIGEST }, internalTest: { freezeSha256: INTERNAL_TEST_SHA, payloadDigest: INTERNAL_TEST_PAYLOAD, membershipDigest: INTERNAL_TEST_MEMBERSHIP, rows: 13, ALLOW: 9, BLOCK: 4 }, benchmark: { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: BENCHMARK_SHA, rows: 140, ALLOW: 67, BLOCK: 73 } },
    provenanceWaiverDisclosure: { code: "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", carriedForwardRequiredInEvaluationContractReportsAndCertification: true, provenanceRecovered: false, researchContinuationBlocked: false },
    exposureHistory: { firstCandidate: { internalTestInferenceCompleted: true, benchmarkInferenceCompleted: true, certified: true }, successorCandidate: { internalTestInferenceCompleted: false, benchmarkInferenceCompleted: false }, projectLevel: { protectedResultsObserved: true, benchmarkDevelopmentInfluential: true, pristineUntouchedEvidenceAvailableForSuccessorDevelopmentClaims: false }, rawTextAccessThisPhase: 0 },
    influenceFinding: { benchmarkInfluencedSuccessorDesign: true, chain: ["FIRST_CANDIDATE_PROTECTED_EVALUATION", "T6L_8E_A_POST_EVALUATION_DIAGNOSTIC", "T6L_8E_B_CATEGORY_AWARE_SUCCESSOR_STRATEGY"], evidence: { categoryRecallGaps: { ABUSIVE_OR_HARASSING: "0/11", HATE: "1/10", OTHER_INAPPROPRIATE: "4/5", PROFANITY: "1/4", SEXUAL: "17/18", THREAT_OR_VIOLENCE: "12/25" }, falsePositiveAbsoluteMarginBands: [31, 0, 0, 0], falseNegativeAbsoluteMarginBands: [18, 11, 7, 2], falseNegativesAtLeast025WrongSide: 20, falseNegativesAtLeast05WrongSide: 9 }, selectedResponse: "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING" },
    classification: { name: "CONTROLLED_REUSED_PROTECTED_COMPARISON", freshUnseenHoldoutEvaluation: false, independentUntouchedProductionEstimate: false, controlledPairedComparativeEvidence: true, labelsAndMembershipFrozen: true, successorDesignFrozenBeforeSuccessorInference: true },
    sourceRoles: { INTERNAL_TEST: { role: "SMALL_REUSED_REGRESSION_AND_PAIRED_COMPARISON_SET", reportSeparately: true, pristine: false, highVariance: true, strongConclusionAuthorized: false }, EXTERNAL_BENCHMARK: { role: "CONTROLLED_REUSED_COMPARISON_BENCHMARK", reportSeparately: true, unseenFinalTest: false, developmentInfluential: true }, pooledSourceMetricAuthorized: false },
    reuseControl: { successorReuseAuthorized: true, exactAdditionalAuthorizedSuccessorEvaluationCycles: 1, exactAuthorizedCycleScope: "ONE_VERSIONED_RUN_OVER_BOTH_FROZEN_SOURCES_WITHOUT_INTERVENING_TUNING", remainingAdditionalCyclesAfterSuccessfulExposure: 0, membershipOrLabelModificationAuthorized: false, silentTuningLoopProhibited: true, automaticRetryAfterExposureAuthorized: false, failedOrInterruptedExposureRequiresSeparateVersionedAuthority: true },
    comparison: { pairedBy: ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"], firstCandidateRerunAuthorized: false, firstCandidateSource: "IMMUTABLE_CERTIFIED_PREDICTIONS_AND_RESULTS", transitions: ["FIRST_WRONG_SUCCESSOR_CORRECT", "FIRST_CORRECT_SUCCESSOR_WRONG", "BOTH_CORRECT", "BOTH_WRONG"], blockTransitions: ["FIRST_FALSE_NEGATIVE_SUCCESSOR_TRUE_POSITIVE", "FIRST_TRUE_POSITIVE_SUCCESSOR_FALSE_NEGATIVE"], allowTransitions: ["FIRST_FALSE_POSITIVE_SUCCESSOR_TRUE_NEGATIVE", "FIRST_TRUE_NEGATIVE_SUCCESSOR_FALSE_POSITIVE"] },
    metrics: { definitionsInheritedFrom: "T6L_8D_A", zeroDenominatorRule: "RETURN_ZERO", confusionMatrixAxes: { rows: "TRUE_LABEL", columns: "PREDICTED_LABEL" }, computedSeparatelyFor: ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"], perSource: commonMetrics, PRIMARY: ["BENCHMARK_PAIRED_TRANSITION_COUNTS", "BENCHMARK_MACRO_F1_DELTA", "BENCHMARK_BALANCED_ACCURACY_DELTA", "BENCHMARK_BLOCK_RECALL_DELTA", "BENCHMARK_FALSE_NEGATIVE_DELTA", "BENCHMARK_FALSE_POSITIVE_DELTA"], SECONDARY: ["BENCHMARK_ALLOW_AND_BLOCK_PRECISION_RECALL_F1_DELTAS", "BENCHMARK_CATEGORY_BLOCK_RECALL_TRANSITIONS", "INTERNAL_TEST_PAIRED_TRANSITION_COUNTS_AND_SOURCE_METRIC_DELTAS"], DIAGNOSTIC: ["BENCHMARK_DIFFICULTY_BREAKDOWN", "BENCHMARK_LANGUAGE_BREAKDOWN", "BENCHMARK_CATEGORY_DENOMINATORS", "UNSCALED_LOGIT_AND_UNCALIBRATED_SCORE_SUMMARIES"] },
    analyses: { category: { enabled: true, outcome: "BLOCK_RECALL_AND_EXACT_CORRECT_COUNT_BY_FROZEN_CATEGORY", interpretation: ["IMPROVED", "UNCHANGED", "DEGRADED"], passFailThreshold: null, smallDenominatorWarningCategories: { PROFANITY: 4, OTHER_INAPPROPRIATE: 5, HATE: 10, ABUSIVE_OR_HARASSING: 11 }, mustNotRequireImprovementEveryCategory: true }, difficulty: { enabled: true, frozenGroups: ["ADVERSARIAL", "CONTEXTUAL", "EASY"], classification: "DIAGNOSTIC" }, language: { enabled: true, frozenGroups: ["en", "en-hi", "hi", "hi-Latn", "th"], classification: "DIAGNOSTIC", smallGroupWarning: true } },
    statisticalPolicy: { decision: "DESCRIPTIVE_PAIRED_COMPARISON_SUFFICIENT", exactTransitionCountsRequired: true, bootstrapConfidenceIntervals: false, mcnemarTest: false, inferentialSignificanceClaimsAuthorized: false, rationale: "FIXED_SMALL_REUSED_SOURCES_AND_NO_PREDECLARED_POWER_OR_ALPHA_PLAN" },
    auxiliaryHeadPolicy: { option: "A_REMAIN_COMPLETELY_UNOBSERVED", executeAuxiliaryHeadForProtectedMetrics: false, persistAuxiliaryLogitsOrPredictions: false, rationale: "MINIMIZE_NEW_DEGREES_OF_FREEDOM_AND_BENCHMARK_OVERFITTING;_BINARY_DECISION_IS_PRODUCT_AUTHORITY" },
    inferenceContract: { laterExecutionOnly: true, device: "CPU", precision: "FP32", training: false, gradients: false, tokenizerFrozen: true, maxLength: 160, successorModelSha256: SELECTED_MODEL_SHA, binaryDecisionRule: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", tieRule: "LOWEST_LABEL_INDEX_ALLOW", ramEligibilityGate: "NONE", resourceDiagnosticsAuthoritativeForEligibility: false, localUserExecutionRequired: true },
    privacy: { thisPhaseProtectedRawTextAccesses: 0, futureRawTextAccess: "TRANSIENT_INSIDE_AUTHORIZED_INFERENCE_BOUNDARY_ONLY", rawTextInReportsOrCertificates: false, preferredOutputFields: ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET", "PREDICTED_TARGET", "UNSCALED_LOGITS", "UNCALIBRATED_SCORES", "CORRECT", "BOUNDED_METADATA"] },
    scoreSemantics: { softmaxValues: "UNCALIBRATED_MODEL_SCORES", confidencePercentageClaimAuthorized: false, calibrationClaimAuthorized: false }, thresholdPolicy: { productionThresholdStatus: "NOT_SELECTED", decisionRuleFrozen: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", thresholdSelectionFromInternalTest: false, thresholdSelectionFromBenchmark: false, sweepAuthorized: false, calibrationAuthorized: false, laterSeparateDevelopmentEvidenceRequired: true },
    interpretation: { requiredQualification: "RESULTS_USE_PREVIOUSLY_OBSERVED_DEVELOPMENT_INFLUENTIAL_PROTECTED_SOURCES_AND_ARE_CONTROLLED_COMPARATIVE_EVIDENCE_NOT_AN_INDEPENDENT_UNTOUCHED_ESTIMATE_OF_FUTURE_PRODUCTION_PERFORMANCE", allowedClaims: ["SUCCESSOR_METRIC_DELTA_ON_REUSED_SOURCE", "EXACT_PAIRED_TRANSITION_COUNTS", "CATEGORY_DIFFICULTY_LANGUAGE_DIFFERENCES_WITH_DENOMINATORS"], prohibitedClaims: ["FRESH_UNSEEN_HOLDOUT_RESULT", "INDEPENDENT_PRODUCTION_GENERALIZATION_ESTIMATE", "PRODUCTION_READINESS", "PRODUCTION_APPROVAL", "CALIBRATED_CONFIDENCE", "PRODUCTION_THRESHOLD", "GLOBAL_PASS_FAIL_DECISION", "PROVENANCE_RECOVERED"], globalPassFailThreshold: null, internalAndBenchmarkPooledHeadlineMetric: false },
    futureConsequences: { ifResultsInfluenceAnotherCandidate: "SUBSEQUENT_CANDIDATE_IS_BENCHMARK_INFORMED_DEVELOPMENT", benchmarkMayRemainRegressionReference: true, benchmarkMayBeCalledIndependentForFutureInformedCandidates: false, repeatedCandidateBenchmarkTuningLoopAuthorized: false, newManualCollectionRequired: false, datasetAcquisitionClosedAbsentLaterGenuineUnusabilityBlocker: true },
    executionPlan: { phases: ["T6L-8F-A_METHODOLOGY", "T6L-8F-B_CONTROLLED_REUSED_EVALUATION_CONTRACT", "T6L-8F-C_LOCAL_RUNNER_PREPARATION", "USER_ONE_LOCAL_CPU_EVALUATION", "T6L-8F-D_EVALUATION_CERTIFICATION_AND_PAIRED_COMPARISON"], thisPhaseCreatesRunner: false, thisPhaseRunsEvaluation: false, exactNextPhase: "T6L-8F-B_SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CONTRACT" },
    boundaries: { modelLoads: 0, forwardPasses: 0, trainingRuns: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0 }, frozenAt: MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FROZEN_AT,
  };
  const artifact: MhsV2SuccessorEvaluationMethodologyArtifact = { ...payload, methodologyPayloadDigest: digest(payload) }; validateMhsV2SuccessorEvaluationMethodology(artifact); return artifact;
};

export const validateMhsV2SuccessorEvaluationMethodology = (artifact: MhsV2SuccessorEvaluationMethodologyArtifact): void => {
  const { methodologyPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SCHEMA || artifact.methodologyVersion !== MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_VERSION || artifact.phase !== "T6L-8F-A" || artifact.status !== "CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED" || methodologyPayloadDigest !== digest(payload)) throw new Error("Invalid T6L-8F-A identity or payload");
  if (MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST && methodologyPayloadDigest !== MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8F-A pinned payload");
  if (MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256 && sha256(Buffer.from(canonicalJson(artifact))) !== MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256) throw new Error("Invalid T6L-8F-A pinned artifact");
  if (artifact.provenanceWaiverDisclosure.code !== "MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION" || artifact.provenanceWaiverDisclosure.provenanceRecovered !== false || artifact.classification.freshUnseenHoldoutEvaluation !== false || artifact.reuseControl.exactAdditionalAuthorizedSuccessorEvaluationCycles !== 1 || artifact.sourceRoles.pooledSourceMetricAuthorized !== false || artifact.auxiliaryHeadPolicy.executeAuxiliaryHeadForProtectedMetrics !== false || artifact.thresholdPolicy.productionThresholdStatus !== "NOT_SELECTED" || Object.values(artifact.boundaries).some((value) => value !== 0)) throw new Error("Invalid T6L-8F-A reuse or execution boundary");
};

type Publisher = (temporary: string, target: string) => void;
export const publishMhsV2SuccessorEvaluationMethodology = (artifact: MhsV2SuccessorEvaluationMethodologyArtifact, outputDirectory: string, publish: Publisher = fs.renameSync): string => {
  validateMhsV2SuccessorEvaluationMethodology(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8F-A methodology exists; overwrite refused"); const temporary = `${target}.${process.pid}.partial`, serialized = canonicalJson(artifact);
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8F-A publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
