import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FILENAME,
  MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256,
  MhsV2SuccessorEvaluationMethodologyArtifact,
  createMhsV2SuccessorEvaluationMethodology,
  defaultMhsV2SuccessorEvaluationMethodologyPaths,
  publishMhsV2SuccessorEvaluationMethodology,
  validateMhsV2SuccessorEvaluationMethodology,
} from "../../research/textModerationDataset/mhsV2SuccessorEvaluationMethodology";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd();
const paths = defaultMhsV2SuccessorEvaluationMethodologyPaths(root);
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation");
const artifactPath = path.join(outputDirectory, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FILENAME);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorEvaluationMethodologyArtifact;
const authority = (name: string): Record<string, unknown> => artifact.authorities[name] as Record<string, unknown>;

const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorEvaluationMethodology(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "CONTROLLED_REUSED_PROTECTED_COMPARISON_AUTHORIZED")],
  ["03 artifact SHA exact", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_SHA256)],
  ["04 payload digest exact", () => assert.equal(artifact.methodologyPayloadDigest, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_PAYLOAD_DIGEST)],
  ["05 publication canonical", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 first evaluation contract exact", () => assert.deepEqual(Object.values(authority("firstControlledEvaluationContract")), ["9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b", "1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e"])],
  ["07 first preparation exact", () => assert.deepEqual(Object.values(authority("firstControlledEvaluationPreparation")), ["09737425a488bd242ca4b30ec2a624f6e5f2dcaf0946f2e747d8f3f089bbf41e", "c556636683ca8fa055cdd3507f0253ebd3f6067876b4a4b66d288093fa44a08d"])],
  ["08 first certification exact", () => assert.deepEqual([authority("firstControlledEvaluationCertification").sha256, authority("firstControlledEvaluationCertification").payloadDigest, authority("firstControlledEvaluationCertification").status], ["8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a", "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943", "CONTROLLED_EVALUATION_CERTIFIED"])],
  ["09 8E-A diagnostic exact", () => assert.deepEqual([authority("postEvaluationDiagnostic").sha256, authority("postEvaluationDiagnostic").payloadDigest, authority("postEvaluationDiagnostic").status], ["edec2e9cfff145e02ac3dc5d3addc18eeb4983a4d2b670638be519da28d88dd5", "c7cb4839792e2fade4e9ffd4f5a4b01cc40d9c83f64dc10bac90f100dc394d1a", "POST_EVALUATION_DIAGNOSTIC_COMPLETE"])],
  ["10 8E-B strategy exact", () => assert.deepEqual([authority("successorStrategy").sha256, authority("successorStrategy").payloadDigest], ["e693587aad615eb4a210503513a6d5b93d8e6be468ab64c2bcfa620e6b451a1e", "c2a4ca5b41587b2f73cf57f1694bb5e2176d0b5466102d882dd510ada157b9f3"])],
  ["11 successor certification exact", () => assert.deepEqual([authority("successorCertification").sha256, authority("successorCertification").payloadDigest, authority("successorCertification").status, authority("successorCertification").selectedModelSha256], ["00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34", "2545404d8aac500431f2ff5658c46272762bfdbefeb2f2243ec35d74e137e7e7", "SUCCESSOR_TRAINING_RUN_CERTIFIED_WITH_PROVENANCE_WAIVER", "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f"])],
  ["12 provenance waiver carried forward", () => assert.deepEqual([artifact.provenanceWaiverDisclosure.code, artifact.provenanceWaiverDisclosure.carriedForwardRequiredInEvaluationContractReportsAndCertification, artifact.provenanceWaiverDisclosure.provenanceRecovered], ["MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", true, false])],
  ["13 INTERNAL_TEST authority exact", () => assert.deepEqual(authority("internalTest"), { freezeSha256: "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", payloadDigest: "23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb", membershipDigest: "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13", rows: 13, ALLOW: 9, BLOCK: 4 })],
  ["14 benchmark authority exact", () => assert.deepEqual(authority("benchmark"), { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747", rows: 140, ALLOW: 67, BLOCK: 73 })],
  ["15 historical exposure exact", () => assert.deepEqual([artifact.exposureHistory.firstCandidate.internalTestInferenceCompleted, artifact.exposureHistory.firstCandidate.benchmarkInferenceCompleted, artifact.exposureHistory.successorCandidate.benchmarkInferenceCompleted], [true, true, false])],
  ["16 benchmark influence represented", () => assert.deepEqual([artifact.influenceFinding.benchmarkInfluencedSuccessorDesign, artifact.influenceFinding.selectedResponse], [true, "BINARY_PLUS_MASKED_AUXILIARY_CATEGORY_NATURAL_SAMPLING"])],
  ["17 no pristine claim", () => assert.deepEqual([artifact.classification.name, artifact.classification.freshUnseenHoldoutEvaluation, artifact.classification.independentUntouchedProductionEstimate], ["CONTROLLED_REUSED_PROTECTED_COMPARISON", false, false])],
  ["18 INTERNAL_TEST role exact", () => assert.deepEqual([artifact.sourceRoles.INTERNAL_TEST.role, artifact.sourceRoles.INTERNAL_TEST.highVariance, artifact.sourceRoles.INTERNAL_TEST.strongConclusionAuthorized], ["SMALL_REUSED_REGRESSION_AND_PAIRED_COMPARISON_SET", true, false])],
  ["19 benchmark role exact", () => assert.deepEqual([artifact.sourceRoles.EXTERNAL_BENCHMARK.role, artifact.sourceRoles.EXTERNAL_BENCHMARK.unseenFinalTest, artifact.sourceRoles.EXTERNAL_BENCHMARK.developmentInfluential], ["CONTROLLED_REUSED_COMPARISON_BENCHMARK", false, true])],
  ["20 sources remain separate", () => assert.deepEqual(artifact.metrics.computedSeparatelyFor, ["INTERNAL_TEST", "EXTERNAL_BENCHMARK"])],
  ["21 no pooled metric", () => assert.equal(artifact.sourceRoles.pooledSourceMetricAuthorized, false)],
  ["22 reuse authorized", () => assert.equal(artifact.reuseControl.successorReuseAuthorized, true)],
  ["23 reuse limit exact", () => assert.deepEqual([artifact.reuseControl.exactAdditionalAuthorizedSuccessorEvaluationCycles, artifact.reuseControl.remainingAdditionalCyclesAfterSuccessfulExposure], [1, 0])],
  ["24 silent tuning loop prohibited", () => assert.deepEqual([artifact.reuseControl.silentTuningLoopProhibited, artifact.reuseControl.automaticRetryAfterExposureAuthorized], [true, false])],
  ["25 paired identity exact", () => assert.deepEqual(artifact.comparison.pairedBy, ["SOURCE", "EXAMPLE_ID", "TEXT_SHA256", "TRUE_TARGET"])],
  ["26 first model rerun prohibited", () => assert.deepEqual([artifact.comparison.firstCandidateRerunAuthorized, artifact.comparison.firstCandidateSource], [false, "IMMUTABLE_CERTIFIED_PREDICTIONS_AND_RESULTS"])],
  ["27 paired transitions frozen", () => assert.deepEqual(artifact.comparison.transitions, ["FIRST_WRONG_SUCCESSOR_CORRECT", "FIRST_CORRECT_SUCCESSOR_WRONG", "BOTH_CORRECT", "BOTH_WRONG"])],
  ["28 primary metrics frozen", () => assert.deepEqual(artifact.metrics.PRIMARY, ["BENCHMARK_PAIRED_TRANSITION_COUNTS", "BENCHMARK_MACRO_F1_DELTA", "BENCHMARK_BALANCED_ACCURACY_DELTA", "BENCHMARK_BLOCK_RECALL_DELTA", "BENCHMARK_FALSE_NEGATIVE_DELTA", "BENCHMARK_FALSE_POSITIVE_DELTA"])],
  ["29 secondary metrics frozen", () => assert.deepEqual(artifact.metrics.SECONDARY, ["BENCHMARK_ALLOW_AND_BLOCK_PRECISION_RECALL_F1_DELTAS", "BENCHMARK_CATEGORY_BLOCK_RECALL_TRANSITIONS", "INTERNAL_TEST_PAIRED_TRANSITION_COUNTS_AND_SOURCE_METRIC_DELTAS"])],
  ["30 diagnostic metrics frozen", () => assert.deepEqual(artifact.metrics.DIAGNOSTIC, ["BENCHMARK_DIFFICULTY_BREAKDOWN", "BENCHMARK_LANGUAGE_BREAKDOWN", "BENCHMARK_CATEGORY_DENOMINATORS", "UNSCALED_LOGIT_AND_UNCALIBRATED_SCORE_SUMMARIES"])],
  ["31 category policy exact", () => assert.deepEqual([artifact.analyses.category.outcome, artifact.analyses.category.interpretation, artifact.analyses.category.passFailThreshold], ["BLOCK_RECALL_AND_EXACT_CORRECT_COUNT_BY_FROZEN_CATEGORY", ["IMPROVED", "UNCHANGED", "DEGRADED"], null])],
  ["32 difficulty policy exact", () => assert.deepEqual(artifact.analyses.difficulty.frozenGroups, ["ADVERSARIAL", "CONTEXTUAL", "EASY"])],
  ["33 language policy exact", () => assert.deepEqual(artifact.analyses.language.frozenGroups, ["en", "en-hi", "hi", "hi-Latn", "th"])],
  ["34 descriptive statistics decision exact", () => assert.deepEqual([artifact.statisticalPolicy.decision, artifact.statisticalPolicy.bootstrapConfidenceIntervals, artifact.statisticalPolicy.mcnemarTest], ["DESCRIPTIVE_PAIRED_COMPARISON_SUFFICIENT", false, false])],
  ["35 auxiliary head remains unobserved", () => assert.deepEqual([artifact.auxiliaryHeadPolicy.option, artifact.auxiliaryHeadPolicy.executeAuxiliaryHeadForProtectedMetrics, artifact.auxiliaryHeadPolicy.persistAuxiliaryLogitsOrPredictions], ["A_REMAIN_COMPLETELY_UNOBSERVED", false, false])],
  ["36 argmax decision rule exact", () => assert.deepEqual([artifact.inferenceContract.binaryDecisionRule, artifact.inferenceContract.tieRule], ["ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", "LOWEST_LABEL_INDEX_ALLOW"])],
  ["37 scores uncalibrated", () => assert.deepEqual([artifact.scoreSemantics.softmaxValues, artifact.scoreSemantics.confidencePercentageClaimAuthorized], ["UNCALIBRATED_MODEL_SCORES", false])],
  ["38 raw text policy exact", () => assert.deepEqual([artifact.privacy.thisPhaseProtectedRawTextAccesses, artifact.privacy.rawTextInReportsOrCertificates], [0, false])],
  ["39 threshold remains unselected", () => assert.deepEqual([artifact.thresholdPolicy.productionThresholdStatus, artifact.thresholdPolicy.sweepAuthorized, artifact.thresholdPolicy.calibrationAuthorized], ["NOT_SELECTED", false, false])],
  ["40 allowed claims bounded", () => assert.ok(artifact.interpretation.allowedClaims.includes("EXACT_PAIRED_TRANSITION_COUNTS"))],
  ["41 prohibited claims bounded", () => assert.ok(artifact.interpretation.prohibitedClaims.includes("FRESH_UNSEEN_HOLDOUT_RESULT"))],
  ["42 future candidate becomes benchmark informed", () => assert.equal(artifact.futureConsequences.ifResultsInfluenceAnotherCandidate, "SUBSEQUENT_CANDIDATE_IS_BENCHMARK_INFORMED_DEVELOPMENT")],
  ["43 no new manual collection required", () => assert.deepEqual([artifact.futureConsequences.newManualCollectionRequired, artifact.futureConsequences.datasetAcquisitionClosedAbsentLaterGenuineUnusabilityBlocker], [false, true])],
  ["44 local CPU execution frozen", () => assert.deepEqual([artifact.inferenceContract.localUserExecutionRequired, artifact.inferenceContract.device, artifact.inferenceContract.precision, artifact.inferenceContract.maxLength], [true, "CPU", "FP32", 160])],
  ["45 no RAM eligibility gate", () => assert.equal(artifact.inferenceContract.ramEligibilityGate, "NONE")],
  ["46 phase sequence exact", () => assert.deepEqual(artifact.executionPlan.phases, ["T6L-8F-A_METHODOLOGY", "T6L-8F-B_CONTROLLED_REUSED_EVALUATION_CONTRACT", "T6L-8F-C_LOCAL_RUNNER_PREPARATION", "USER_ONE_LOCAL_CPU_EVALUATION", "T6L-8F-D_EVALUATION_CERTIFICATION_AND_PAIRED_COMPARISON"])],
  ["47 execution counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
];
for (const [name, check] of checks) test(name, check);

test("48 deterministic reconstruction equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorEvaluationMethodology(paths)), fs.readFileSync(artifactPath, "utf8")));
test("49 changed classification rejected", () => { const clone = structuredClone(artifact); clone.classification.freshUnseenHoldoutEvaluation = true; assert.throws(() => validateMhsV2SuccessorEvaluationMethodology(clone), /payload|boundary/u); });
test("50 changed waiver rejected", () => { const clone = structuredClone(artifact); clone.provenanceWaiverDisclosure.provenanceRecovered = true; assert.throws(() => validateMhsV2SuccessorEvaluationMethodology(clone), /payload|boundary/u); });
test("51 upstream mutation fails closed", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-a-upstream-")); try { const copied = Object.fromEntries(Object.entries(paths).map(([key, value]) => { const target = path.join(directory, path.basename(value)); fs.copyFileSync(value, target); return [key, target]; })) as unknown as typeof paths; fs.appendFileSync(copied.strategy, " "); assert.throws(() => createMhsV2SuccessorEvaluationMethodology(copied), /SHA mismatch/u); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("52 publication replay refused", () => assert.throws(() => publishMhsV2SuccessorEvaluationMethodology(artifact, outputDirectory), /overwrite refused/u));
test("53 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8f-a-publish-")); try { assert.throws(() => publishMhsV2SuccessorEvaluationMethodology(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_EVALUATION_METHODOLOGY_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("54 implementation contains no ML execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorEvaluationMethodology.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|AutoModel|trainer\.train|trainer\.evaluate|torch|model\s*\(/iu); });
