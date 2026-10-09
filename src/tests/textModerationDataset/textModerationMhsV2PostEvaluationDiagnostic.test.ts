import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { sha256FileStreaming } from "../../research/textModerationDataset/mhsV2ControlledEvaluationCertification";
import {
  ABSOLUTE_LOGIT_MARGIN_BANDS,
  MHS_V2_POST_EVALUATION_DIAGNOSTIC_FILENAME,
  MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST,
  MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256,
  boundaryBands,
  createMhsV2PostEvaluationDiagnostic,
  defaultMhsV2PostEvaluationDiagnosticPaths,
  descriptiveStatistics,
  publishMhsV2PostEvaluationDiagnostic,
  validateMhsV2PostEvaluationDiagnostic,
} from "../../research/textModerationDataset/mhsV2PostEvaluationDiagnostic";

const root = process.cwd();
const paths = defaultMhsV2PostEvaluationDiagnosticPaths(root);
const artifact = createMhsV2PostEvaluationDiagnostic(paths);
const published = path.join(path.dirname(paths.certification), MHS_V2_POST_EVALUATION_DIAGNOSTIC_FILENAME);
const fp = artifact.errorDiagnostics.falsePositives;
const fn = artifact.errorDiagnostics.falseNegatives;

test("01 exact certified-evaluation authority", () => assert.deepEqual(artifact.authorities.evaluationCertification, { sha256: "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a", payloadDigest: "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943" }));
test("02 exact evaluation-manifest authority", () => assert.deepEqual(artifact.authorities.evaluationRunManifest, { sha256: "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718", payloadDigest: "52d71642b456a1a2fe2de631d82d138787901a407fb7f96fddb7fa2e9bbcd90e" }));
test("03 exact model/tokenizer authorities", () => assert.deepEqual([artifact.authorities.candidateSha256, artifact.authorities.tokenizerSha256, artifact.authorities.tokenizerBindingSha256], ["3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79", "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c", "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"]));
test("04 TRAIN authority", () => assert.deepEqual(artifact.authorities.train, { sha256: "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74", payloadDigest: "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff", membershipDigest: "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61" }));
test("05 VALIDATION authority", () => assert.deepEqual(artifact.authorities.validation, { sha256: "5c01425c9c7e6e1f4348e38a98eaf1740898c3ba98f2bb6114d77175631b0d29", payloadDigest: "a1c46eff57f8ee501440fa92eb86f990d8a8648d425a771fd48bbe72447be095", membershipDigest: "2c3e7cc4372c266e3bab8d42a092c74807351c09563f38f46ba0da8fd8eb8164" }));
test("06 protected authority hashes", () => assert.deepEqual([artifact.authorities.internalTestFreezeSha256, artifact.authorities.benchmark.sha256], ["11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"]));
test("07 certified baselines preserved", () => assert.deepEqual([artifact.certifiedBaseline.INTERNAL_TEST.confusionMatrix, artifact.certifiedBaseline.EXTERNAL_BENCHMARK.confusionMatrix], [[[8, 1], [1, 3]], [[36, 31], [38, 35]]]));
test("08 no pooled metric or threshold", () => assert.deepEqual([artifact.certifiedBaseline.pooledAuthoritativeMetric, artifact.certifiedBaseline.productionThresholdStatus], [null, "NOT_SELECTED"]));
test("09 fixed bands declared", () => assert.deepEqual([...ABSOLUTE_LOGIT_MARGIN_BANDS], ["[0,0.25)", "[0.25,0.5)", "[0.5,1)", "[1,+inf)"]));
test("10 R7 descriptive statistics", () => assert.deepEqual(descriptiveStatistics([1, 2, 3, 4]), { count: 4, min: 1, max: 4, mean: 2.5, p25: 1.75, median: 2.5, p75: 3.25, percentileMethod: "LINEAR_INTERPOLATION_R7" }));
test("11 empty statistics rejected", () => assert.throws(() => descriptiveStatistics([]), /finite values/));
test("12 nonfinite statistics rejected", () => assert.throws(() => descriptiveStatistics([Number.NaN]), /finite values/));
test("13 benchmark false positives", () => assert.equal(fp.count, 31));
test("14 benchmark false negatives", () => assert.equal(fn.count, 38));
test("15 false-positive bands", () => assert.deepEqual(fp.absoluteLogitMarginBands, { "[0,0.25)": 31, "[0.25,0.5)": 0, "[0.5,1)": 0, "[1,+inf)": 0 }));
test("16 false-negative bands", () => assert.deepEqual(fn.absoluteLogitMarginBands, { "[0,0.25)": 18, "[0.25,0.5)": 11, "[0.5,1)": 7, "[1,+inf)": 2 }));
test("17 false-positive logit margin statistics", () => assert.deepEqual(fp.statistics.logitMargin, { count: 31, min: .001929655671, max: .142443172634, mean: .083141658095, p25: .064358852804, median: .091926775873, p75: .106121499091, percentileMethod: "LINEAR_INTERPOLATION_R7" }));
test("18 false-negative logit margin statistics", () => assert.deepEqual(fn.statistics.logitMargin, { count: 38, min: -1.342760920525, max: -.002992928028, mean: -.347650509823, p25: -.470307633746, median: -.277261895128, p75: -.096425136551, percentileMethod: "LINEAR_INTERPOLATION_R7" }));
test("19 false-positive difficulty", () => assert.deepEqual(fp.difficulty, { CONTEXTUAL: 13, EASY: 18 }));
test("20 false-negative difficulty", () => assert.deepEqual(fn.difficulty, { ADVERSARIAL: 11, CONTEXTUAL: 6, EASY: 21 }));
test("21 false-positive language", () => assert.deepEqual(fp.language, { en: 22, "en-hi": 1, hi: 2, "hi-Latn": 1, th: 5 }));
test("22 false-negative language", () => assert.deepEqual(fn.language, { en: 34, hi: 2, "hi-Latn": 2 }));
test("23 false-negative categories", () => assert.deepEqual(fn.expectedCategory, { ABUSIVE_OR_HARASSING: 11, HATE: 9, OTHER_INAPPROPRIATE: 1, PROFANITY: 3, SEXUAL: 1, THREAT_OR_VIOLENCE: 13 }));
test("24 category recalls", () => assert.deepEqual(Object.fromEntries(Object.entries(artifact.categoryDiagnostics as Record<string, { metrics: { blockRecall: number } }>).map(([key, value]) => [key, value.metrics.blockRecall])), { ABUSIVE_OR_HARASSING: 0, HATE: .1, OTHER_INAPPROPRIATE: .8, PROFANITY: .25, SEXUAL: 17 / 18, THREAT_OR_VIOLENCE: .48 }));
test("24a category totals exact", () => assert.deepEqual(Object.fromEntries(Object.entries(artifact.categoryDiagnostics as Record<string, { metrics: { confusionMatrix: number[][] } }>).map(([key, value]) => [key, value.metrics.confusionMatrix[1][0] + value.metrics.confusionMatrix[1][1]])), { ABUSIVE_OR_HARASSING: 11, HATE: 10, OTHER_INAPPROPRIATE: 5, PROFANITY: 4, SEXUAL: 18, THREAT_OR_VIOLENCE: 25 }));
test("24b category false-negative counts exact", () => assert.deepEqual(Object.fromEntries(Object.entries(artifact.categoryDiagnostics as Record<string, { metrics: { confusionMatrix: number[][] } }>).map(([key, value]) => [key, value.metrics.confusionMatrix[1][0]])), { ABUSIVE_OR_HARASSING: 11, HATE: 9, OTHER_INAPPROPRIATE: 1, PROFANITY: 3, SEXUAL: 1, THREAT_OR_VIOLENCE: 13 }));
test("24c category totals aggregate to 73 BLOCK rows", () => assert.equal(Object.values(artifact.categoryDiagnostics as Record<string, { metrics: { confusionMatrix: number[][] } }>).reduce((sum, value) => sum + value.metrics.confusionMatrix[1][0] + value.metrics.confusionMatrix[1][1], 0), 73));
test("25 TRAIN labels", () => assert.deepEqual(artifact.trainComposition.labels, { ALLOW: 110, BLOCK: 90 }));
test("26 TRAIN origins", () => assert.deepEqual(artifact.trainComposition.origin, { HISTORICAL_MHS_V1: 60, MHS_V2_EXPANSION: 140 }));
test("27 TRAIN language and script", () => assert.deepEqual([artifact.trainComposition.language, artifact.trainComposition.script], [{ en: 200 }, { LATIN: 200 }]));
test("28 TRAIN BLOCK categories", () => assert.deepEqual(artifact.trainComposition.blockPrimaryCategory, { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 }));
test("29 absent TRAIN comparison metadata explicit", () => assert.deepEqual([artifact.trainComposition.difficultyMetadata, artifact.trainComposition.domainMetadata, artifact.trainComposition.benchmarkStyleTags], ["ABSENT", "ABSENT", "ABSENT"]));
test("30 benchmark composition", () => assert.deepEqual([artifact.benchmarkComposition.rows, artifact.benchmarkComposition.labels], [140, { ALLOW: 67, BLOCK: 73 }]));
test("30a benchmark difficulty totals exact", () => assert.deepEqual(artifact.benchmarkComposition.difficulty, { ADVERSARIAL: 22, CONTEXTUAL: 56, EASY: 62 }));
test("30b benchmark difficulty aggregates to 140", () => assert.equal(Object.values(artifact.benchmarkComposition.difficulty as Record<string, number>).reduce((sum, value) => sum + value, 0), 140));
test("30c benchmark language totals exact", () => assert.deepEqual(artifact.benchmarkComposition.language, { en: 115, "en-hi": 2, hi: 10, "hi-Latn": 4, th: 9 }));
test("30d benchmark language aggregates to 140", () => assert.equal(Object.values(artifact.benchmarkComposition.language as Record<string, number>).reduce((sum, value) => sum + value, 0), 140));
test("31 comparison statuses bounded", () => assert.deepEqual(Object.values(artifact.compositionComparisons as Record<string, { status: string }>).map((value) => value.status), ["SUPPORTED_COMPARISON", "SUPPORTED_COMPARISON", "SUPPORTED_COMPARISON", "NOT_COMPARABLE", "NOT_COMPARABLE", "NOT_COMPARABLE"]));
test("32 training dynamics exact", () => assert.deepEqual(artifact.trainingDynamics.epochs.map((row: { epoch: number; trainingLoss: number; validationMacroF1: number }) => [row.epoch, row.trainingLoss, row.validationMacroF1]), [[1, .7163, .40909090909090906], [2, .6597, .7067669172932332], [3, .6149, .7833333333333333]]));
test("33 underfitting not overclaimed", () => assert.equal(artifact.trainingDynamics.optimizationUnderfittingStatus, "POSSIBLE_NOT_ESTABLISHED"));
test("34 no more epochs authorized", () => assert.equal(artifact.trainingDynamics.moreEpochsAuthorized, false));
test("35 deterministic production rules bounded", () => assert.deepEqual([artifact.deterministicRuleContext.benchmarkScope, artifact.deterministicRuleContext.meaningfulRealPolicyClassCoverage, artifact.deterministicRuleContext.fullStackPerformanceMeasured], ["CLASSIFIER_ONLY", [], false]));
test("36 future matrix has paths A-G", () => assert.deepEqual(artifact.futurePathDecisionMatrix.map((row: { path: string }) => row.path.slice(0, 1)), ["A", "B", "C", "D", "E", "F", "G"]));
test("37 future matrix statuses exact", () => assert.deepEqual(artifact.futurePathDecisionMatrix.map((row: { evidenceStatus: string }) => row.evidenceStatus), ["SUPPORTED_FOR_FUTURE_DESIGN", "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", "SUPPORTED_FOR_FUTURE_DESIGN", "SUPPORTED_FOR_FUTURE_DESIGN", "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE", "NOT_SUPPORTED_BY_CURRENT_EVIDENCE", "PLAUSIBLE_BUT_INSUFFICIENT_EVIDENCE"]));
test("38 limitations preserve protected benchmark", () => assert.ok(artifact.limitations.includes("PROTECTED_RESULTS_MUST_NOT_BE_USED_AS_A_TUNING_TARGET")));
test("39 no execution or production mutation", () => assert.deepEqual(artifact.boundaries, { modelLoads: 0, forwardPasses: 0, newProtectedInference: 0, protectedRawTextAccesses: 0, trainingRuns: 0, thresholdSelections: 0, reserveUses: 0, exclusionUses: 0, newTrainingExamples: 0, newLabels: 0, productionChanges: 0, productionThresholdStatus: "NOT_SELECTED" }));
test("40 raw text absent from artifact", () => assert.doesNotMatch(canonicalJson(artifact), /"text"\s*:/u));
test("41 artifact validates", () => assert.doesNotThrow(() => validateMhsV2PostEvaluationDiagnostic(artifact)));
test("42 modified payload rejected", () => { const changed = JSON.parse(JSON.stringify(artifact)); changed.status = "CHANGED"; assert.throws(() => validateMhsV2PostEvaluationDiagnostic(changed), /identity\/payload/); });
test("43 boundary mutation rejected", () => { const changed = JSON.parse(JSON.stringify(artifact)); changed.boundaries.modelLoads = 1; assert.throws(() => validateMhsV2PostEvaluationDiagnostic(changed), /identity\/payload/); });
test("44 deterministic replay", () => assert.equal(canonicalJson(createMhsV2PostEvaluationDiagnostic(paths)), canonicalJson(artifact)));
test("45 immutable publication refuses overwrite", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8e-a-")); try { publishMhsV2PostEvaluationDiagnostic(artifact, directory); assert.throws(() => publishMhsV2PostEvaluationDiagnostic(artifact, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("46 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8e-a-")); try { assert.throws(() => publishMhsV2PostEvaluationDiagnostic(artifact, directory, () => { throw new Error("injected"); }), /injected/); assert.equal(fs.existsSync(path.join(directory, MHS_V2_POST_EVALUATION_DIAGNOSTIC_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("47 published artifact canonical and pinned", () => { assert.equal(sha256FileStreaming(published), MHS_V2_POST_EVALUATION_DIAGNOSTIC_SHA256); assert.equal(artifact.diagnosticPayloadDigest, MHS_V2_POST_EVALUATION_DIAGNOSTIC_PAYLOAD_DIGEST); assert.equal(fs.readFileSync(published, "utf8"), canonicalJson(artifact)); });
test("48 source has no ML dependency or threshold sweep", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2PostEvaluationDiagnostic.ts"), "utf8"); assert.doesNotMatch(source, /torch|transformers|AutoModel|forward\s*\(|thresholdSweep|optimi[sz]eThreshold/u); });
test("49 boundary band helper is deterministic", () => assert.deepEqual(boundaryBands([{ blockLogit: .1, allowLogit: 0 }, { blockLogit: .3, allowLogit: 0 }, { blockLogit: 1, allowLogit: 0 }] as never), { "[0,0.25)": 1, "[0.25,0.5)": 1, "[0.5,1)": 0, "[1,+inf)": 1 }));
test("50 final status exact", () => assert.equal(artifact.status, "POST_EVALUATION_DIAGNOSTIC_COMPLETE"));
