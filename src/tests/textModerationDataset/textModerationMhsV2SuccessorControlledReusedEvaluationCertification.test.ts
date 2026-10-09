import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_FILENAME,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_SHA256,
  createMhsV2SuccessorControlledReusedEvaluationCertification,
  defaultSuccessorEvaluationCertificationPaths,
  metricValues,
  pairedJoin,
  publishMhsV2SuccessorControlledReusedEvaluationCertification,
  readRows,
  sha256FileStreaming,
  validateMhsV2SuccessorControlledReusedEvaluationCertification,
  validateRows,
} from "../../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationCertification";

const root = process.cwd(), paths = defaultSuccessorEvaluationCertificationPaths(root), artifact: any = createMhsV2SuccessorControlledReusedEvaluationCertification(paths);
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation"), published = path.join(outputDirectory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_FILENAME);
const firstInternal = readRows(paths.firstInternal), successorInternal = readRows(paths.successorInternal), firstBenchmark = readRows(paths.firstBenchmark), successorBenchmark = readRows(paths.successorBenchmark);
const internal = artifact.certifiedComparison.INTERNAL_TEST, benchmark = artifact.certifiedComparison.EXTERNAL_BENCHMARK;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorControlledReusedEvaluationCertification(artifact))],
  ["02 status exact", () => assert.equal(artifact.status, "SUCCESSOR_CONTROLLED_REUSED_EVALUATION_CERTIFIED")],
  ["03 artifact SHA pinned", () => assert.equal(sha256FileStreaming(published), MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_SHA256)],
  ["04 payload digest pinned", () => assert.equal(artifact.certificationPayloadDigest, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(published, "utf8"), canonicalJson(artifact))],
  ["06 8F-A exact", () => assert.equal(artifact.authorities.methodology.sha256, "62031d2a99fd89eb0280f15d3a96d740bd277422de4b271e30d61ef597377865")],
  ["07 8F-B exact", () => assert.equal(artifact.authorities.contract.sha256, "5c0053213dc3993424ab687d2800f2ed9716ba7f10dfbaa34fd863f5afaecb02")],
  ["08 8F-C exact", () => assert.equal(artifact.authorities.preparation.sha256, "23f5a19a81566ae6b2087fd70b57d1d3140e2d992099523e3d575ae074ebaf25")],
  ["09 successor certification exact", () => assert.equal(artifact.authorities.successorCertification.sha256, "00e6877a52a07bcaa23c472246f316e645ceb260ea5fd90991e1b95497a0ac34")],
  ["10 successor model exact", () => assert.equal(artifact.authorities.successorModelSha256, "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f")],
  ["11 execution source provenance complete", () => assert.deepEqual(artifact.authorities.executionSources, { runner: "850effd2e49d74eea0dfe6a233f2bdb84ae1c07bf5caf9b30f60e8d3e1a37ebd", metricsHelper: "4b0598a66c452a7b916794677d8480e8274325ae2420c9fbd33cc61fbe075a46", modelAdapter: "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831", protectedBridge: "04f4e41dd2a1348ad198bd955fcf3200e949f5b7988d10ee2c768c285ab8447f", protectedLoader: "1ba59c081550e80b3244a2c558aafcfd60bf0c8bf260787330e82ca2b06e088a" })],
  ["12 training waiver retained", () => assert.deepEqual([artifact.authorities.trainingProvenance.code, artifact.authorities.trainingProvenance.provenanceRecovered], ["MISSING_EXECUTED_SOURCE_BYTE_ATTESTATION", false])],
  ["13 internal authority exact", () => assert.deepEqual([artifact.authorities.internalTest.rows, artifact.authorities.internalTest.ALLOW, artifact.authorities.internalTest.BLOCK], [13, 9, 4])],
  ["14 benchmark authority exact", () => assert.deepEqual([artifact.authorities.benchmark.version, artifact.authorities.benchmark.rows, artifact.authorities.benchmark.ALLOW, artifact.authorities.benchmark.BLOCK], ["STHN_TEXT_MODERATION_FIXTURES_V1R", 140, 67, 73])],
  ["15 first authorities exact", () => assert.deepEqual([artifact.authorities.firstEvaluation.manifestSha256, artifact.authorities.firstEvaluation.internalPredictionsSha256, artifact.authorities.firstEvaluation.benchmarkPredictionsSha256], ["e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718", "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be", "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743"])],
  ["16 run manifest exact", () => assert.equal(artifact.run.runManifestSha256, "4a601cee8e612c56a81dd8033bbe5cfec84740d5cc22fc4cfc00208ce261db61")],
  ["17 result summary exact", () => assert.equal(artifact.run.resultSummarySha256, "011fca75a201bb30105c3e9c8167673474b82c9e411b0a5fece1000dbd1d3964")],
  ["18 lifecycle completed", () => assert.deepEqual([artifact.run.lifecycle.status, artifact.run.lifecycle.sha256], ["COMPLETED", "7462b85cc42782469207a0094588b953591071233d1a528b9171da1f4471c354"])],
  ["19 ledger exact", () => assert.deepEqual([artifact.run.exposureLedger.sha256, artifact.run.exposureLedger.eventCount], ["ae9e3de88f1321e85a48b6aac97baa1dfc747af1bf1d57b7c06068aa13c3d31b", 6])],
  ["20 exposure order exact", () => assert.deepEqual(artifact.run.exposureLedger.events.map((event: any) => event.event), ["EVALUATION_CYCLE_INITIALIZED", "INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED", "EVALUATION_CYCLE_COMPLETED"])],
  ["21 cycle exhausted", () => assert.deepEqual([artifact.exposure.cycleConsumed, artifact.exposure.remainingAuthorizedCycles], [true, 0])],
  ["22 no duplicate exposure", () => assert.deepEqual([artifact.exposure.duplicateAccessEvents, artifact.exposure.extraExposureEvents, artifact.exposure.alternateRootUsed], [0, 0, false])],
  ["23 successor row counts", () => assert.deepEqual(artifact.reconciliation.successorRows, { INTERNAL_TEST: 13, EXTERNAL_BENCHMARK: 140, separateTotal: 153 })],
  ["24 paired counts", () => assert.deepEqual(artifact.reconciliation.pairedRows, { INTERNAL_TEST: 13, EXTERNAL_BENCHMARK: 140 })],
  ["25 joins clean", () => assert.deepEqual([artifact.reconciliation.duplicateRows, artifact.reconciliation.missingRows, artifact.reconciliation.extraRows, artifact.reconciliation.targetMismatches, artifact.reconciliation.textDigestMismatches], [0, 0, 0, 0, 0])],
  ["26 persisted metrics reconcile", () => assert.equal(artifact.reconciliation.persistedMetricsMatch, true)],
  ["27 paired artifacts reconcile", () => assert.equal(artifact.reconciliation.pairedComparisonsMatch, true)],
  ["28 slices reconcile", () => assert.equal(artifact.reconciliation.slicesMatch, true)],
  ["29 raw text absent", () => assert.equal(artifact.reconciliation.rawTextPersisted, false)],
  ["30 auxiliary output absent", () => assert.equal(artifact.reconciliation.auxiliaryOutputPersisted, false)],
  ["31 internal first confusion", () => assert.deepEqual(internal.firstMetrics.confusionMatrix, [[8, 1], [1, 3]])],
  ["32 internal successor confusion", () => assert.deepEqual(internal.successorMetrics.confusionMatrix, [[9, 0], [0, 4]])],
  ["33 internal transitions", () => assert.deepEqual(internal.pairedTransitions, { FIRST_WRONG_SUCCESSOR_CORRECT: 2, FIRST_CORRECT_SUCCESSOR_WRONG: 0, BOTH_CORRECT: 11, BOTH_WRONG: 0 })],
  ["34 benchmark first confusion", () => assert.deepEqual(benchmark.firstMetrics.confusionMatrix, [[36, 31], [38, 35]])],
  ["35 benchmark successor confusion", () => assert.deepEqual(benchmark.successorMetrics.confusionMatrix, [[63, 4], [44, 29]])],
  ["36 benchmark transitions", () => assert.deepEqual(benchmark.pairedTransitions, { FIRST_WRONG_SUCCESSOR_CORRECT: 36, FIRST_CORRECT_SUCCESSOR_WRONG: 15, BOTH_CORRECT: 56, BOTH_WRONG: 33 })],
  ["37 benchmark macro F1 delta", () => assert.equal(benchmark.deltas.macroF1, 0.12853616109036936)],
  ["38 benchmark balanced accuracy delta", () => assert.equal(benchmark.deltas.balancedAccuracy, 0.16039664690247402)],
  ["39 benchmark block recall delta", () => assert.equal(benchmark.deltas.blockRecall, -0.0821917808219178)],
  ["40 benchmark FN delta", () => assert.equal(benchmark.deltas.falseNegatives, 6)],
  ["41 benchmark FP delta", () => assert.equal(benchmark.deltas.falsePositives, -27)],
  ["42 category denominators", () => assert.deepEqual(Object.fromEntries(Object.entries(benchmark.category).map(([key, value]: [string, any]) => [key, value.total])), { ABUSIVE_OR_HARASSING: 11, HATE: 10, OTHER_INAPPROPRIATE: 5, PROFANITY: 4, SEXUAL: 18, THREAT_OR_VIOLENCE: 25 })],
  ["43 difficulty totals", () => assert.deepEqual(Object.fromEntries(Object.entries(benchmark.difficulty).map(([key, value]: [string, any]) => [key, value.total])), { ADVERSARIAL: 22, CONTEXTUAL: 56, EASY: 62 })],
  ["44 language totals", () => assert.deepEqual(Object.fromEntries(Object.entries(benchmark.language).map(([key, value]: [string, any]) => [key, value.total])), { en: 115, "en-hi": 2, hi: 10, "hi-Latn": 4, th: 9 })],
  ["45 small language warning", () => assert.equal(benchmark.languageSmallGroupWarning, true)],
  ["46 no pooled metric", () => assert.equal(artifact.certifiedComparison.pooled153RowMetric, null)],
  ["47 descriptive statistics only", () => assert.equal(artifact.interpretation.statistics, "DESCRIPTIVE_PAIRED_COMPARISON_ONLY")],
  ["48 reused classification", () => assert.equal(artifact.certifiedComparison.classification, "CONTROLLED_REUSED_PROTECTED_COMPARISON")],
  ["49 non-independent limitation", () => assert.deepEqual([artifact.interpretation.freshUnseenTest, artifact.interpretation.independentGeneralizationEstimate, artifact.interpretation.productionEstimate], [false, false, false])],
  ["50 internal warning", () => assert.equal(artifact.interpretation.internalTestWarning, "13_ROWS_SMALL_SAMPLE_HIGH_VARIANCE")],
  ["51 auxiliary policy", () => assert.deepEqual([artifact.interpretation.auxiliaryComputation, artifact.interpretation.auxiliaryObservation], ["TRANSIENT_UNOBSERVED", "PROHIBITED"])],
  ["52 threshold absent", () => assert.equal(artifact.interpretation.threshold, "NOT_SELECTED")],
  ["53 production unauthorized", () => assert.equal(artifact.interpretation.productionAuthorized, false)],
  ["54 future inference unauthorized", () => assert.equal(artifact.interpretation.futureProtectedInferenceAuthorized, false)],
  ["55 certification counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
  ["56 successor rows validate", () => { validateRows(successorInternal, "INTERNAL_TEST", 13, true); validateRows(successorBenchmark, "EXTERNAL_BENCHMARK", 140, true); }],
  ["57 first rows validate", () => { validateRows(firstInternal, "INTERNAL_TEST", 13, false); validateRows(firstBenchmark, "EXTERNAL_BENCHMARK", 140, false); }],
  ["58 metric recomputation", () => assert.deepEqual(metricValues(successorBenchmark), benchmark.successorMetrics)],
  ["59 exact joins", () => assert.deepEqual([pairedJoin(firstInternal, successorInternal).length, pairedJoin(firstBenchmark, successorBenchmark).length], [13, 140])],
  ["60 score diagnostics bounded", () => assert.deepEqual([artifact.scoreDiagnostics.rowLevelBinaryLogitsAndUncalibratedScoresValidated, artifact.scoreDiagnostics.aggregateScoreDiagnosticArtifactProducedByRun, artifact.scoreDiagnostics.calibrationClaim, artifact.scoreDiagnostics.thresholdDerived], [true, false, false, false])],
];
for (const [name, check] of checks) test(name, check);

test("61 duplicate join rejected", () => assert.throws(() => pairedJoin(firstInternal, [successorInternal[0], successorInternal[0], ...successorInternal.slice(2)]), /duplicate join key/u));
test("62 missing join rejected", () => assert.throws(() => pairedJoin(firstInternal, successorInternal.slice(1)), /paired join membership/u));
test("63 target mismatch rejected", () => { const changed = Array.from(clone(successorInternal)) as any[]; changed[0].trueTarget = changed[0].trueTarget ? 0 : 1; assert.throws(() => pairedJoin(firstInternal, changed), /paired join membership/u); });
test("64 raw text rejected", () => { const changed = Array.from(clone(successorInternal)) as any[]; changed[0].text = "forbidden"; assert.throws(() => validateRows(changed, "INTERNAL_TEST", 13, true), /row schema/u); });
test("65 auxiliary output rejected", () => { const changed = Array.from(clone(successorInternal)) as any[]; changed[0].auxiliaryLogits = [0, 0, 0, 0, 0]; assert.throws(() => validateRows(changed, "INTERNAL_TEST", 13, true), /row schema/u); });
test("66 nonfinite rejected", () => { const changed = Array.from(clone(successorInternal)) as any[]; changed[0].allowLogit = Number.NaN; assert.throws(() => validateRows(changed, "INTERNAL_TEST", 13, true), /nonfinite/u); });
test("67 authority mismatch fails", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8f-d-authority-")); try { const changed = path.join(directory, "manifest.json"); fs.copyFileSync(paths.runManifest, changed); fs.appendFileSync(changed, " "); assert.throws(() => createMhsV2SuccessorControlledReusedEvaluationCertification({ ...paths, runManifest: changed }), /run manifest SHA mismatch/u); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("68 deterministic reconstruction", () => assert.equal(canonicalJson(createMhsV2SuccessorControlledReusedEvaluationCertification(paths)), canonicalJson(artifact)));
test("69 immutable replay refused", () => assert.throws(() => publishMhsV2SuccessorControlledReusedEvaluationCertification(artifact, outputDirectory), /overwrite refused/u));
test("70 rollback clean", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8f-d-publish-")); try { assert.throws(() => publishMhsV2SuccessorControlledReusedEvaluationCertification(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_REUSED_EVALUATION_CERTIFICATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("71 source contains no model execution or protected loader invocation", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationCertification.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|AutoModel|torch|transformers|loadAuthorizedInternalTestRows|loadAuthorizedExternalBenchmarkRows|forward\s*\(/u); });
