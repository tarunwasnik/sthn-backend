import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_FILENAME,
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256,
  createMhsV2ControlledEvaluationCertification,
  defaultControlledEvaluationCertificationPaths,
  metricValues,
  publishMhsV2ControlledEvaluationCertification,
  readPredictionJsonl,
  sha256FileStreaming,
  validateMhsV2ControlledEvaluationCertification,
  validatePredictionRows,
} from "../../research/textModerationDataset/mhsV2ControlledEvaluationCertification";

const root = process.cwd(), paths = defaultControlledEvaluationCertificationPaths(root), artifact: any = createMhsV2ControlledEvaluationCertification(paths);
const internal = readPredictionJsonl(paths.internalPredictions), benchmark = readPredictionJsonl(paths.benchmarkPredictions);
const published = path.join(path.dirname(paths.contract), MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_FILENAME);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("01 exact 8D-A binding", () => assert.deepEqual(artifact.authorities.controlledEvaluationContract, { sha256: "1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e", payloadDigest: "9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b" }));
test("02 exact 8D-B binding", () => assert.deepEqual([artifact.authorities.runnerPreparation.sha256, artifact.authorities.runnerPreparation.payloadDigest], ["c556636683ca8fa055cdd3507f0253ebd3f6067876b4a4b66d288093fa44a08d", "09737425a488bd242ca4b30ec2a624f6e5f2dcaf0946f2e747d8f3f089bbf41e"]));
test("03 runner binding", () => assert.equal(artifact.authorities.runnerPreparation.runnerSha256, "8a8d35298d6ead77b725935af1562dfe9118e6c1c06b514d5a77ed6ef4e1efc0"));
test("04 bridge binding", () => assert.equal(artifact.authorities.runnerPreparation.protectedSourceBridgeSha256, "dd6f90fc0e4ff224faf417636108df4a1c591aff7448bfbea125c642c5359525"));
test("05 exact 8C3 binding", () => assert.deepEqual([artifact.authorities.trainingCertification.sha256, artifact.authorities.trainingCertification.payloadDigest], ["43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a", "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47"]));
test("06 candidate binding", () => assert.equal(artifact.authorities.candidate.sha256, "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79"));
test("07 tokenizer bindings", () => assert.deepEqual([artifact.authorities.tokenizer.sha256, artifact.authorities.tokenizer.bindingSha256], ["a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c", "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654"]));
test("08 INTERNAL_TEST authority", () => assert.deepEqual([artifact.authorities.internalTest.freezeSha256, artifact.authorities.internalTest.membershipDigest, artifact.authorities.internalTest.count], ["11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13", 13]));
test("09 benchmark authority", () => assert.deepEqual([artifact.authorities.externalBenchmark.version, artifact.authorities.externalBenchmark.sha256, artifact.authorities.externalBenchmark.count], ["STHN_TEXT_MODERATION_FIXTURES_V1R", "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747", 140]));
test("10 manifest exact", () => assert.deepEqual(artifact.run.runManifest, { sha256: "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718", payloadDigest: "52d71642b456a1a2fe2de631d82d138787901a407fb7f96fddb7fa2e9bbcd90e" }));
test("11 lifecycle completed", () => assert.deepEqual([artifact.run.lifecycle.status, artifact.run.lifecycle.sha256], ["COMPLETED", "8c04a68be03ede88882329fd8436ec40ffba5a6da5e5f238319f61bb151e259e"]));
test("12 summary completed", () => assert.deepEqual([artifact.run.resultSummary.status, artifact.run.resultSummary.sha256], ["CONTROLLED_EVALUATION_COMPLETED", "21d4b7002abcdf38b7d45ccd23e5909d9a68a2ff0661161480229942f9e33484"]));
test("13 exposure order exact", () => assert.deepEqual(artifact.run.exposureLedger.events.map((row: any) => row.event), ["INTERNAL_TEST_ACCESS_STARTED", "INTERNAL_TEST_EVALUATION_COMPLETED", "EXTERNAL_BENCHMARK_ACCESS_STARTED", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED"]));
test("14 all evidence indexed", () => assert.equal(artifact.run.evidence.length, 6));
test("15 all evidence bytes and hashes match", () => artifact.run.evidence.forEach((entry: any) => { const filename = path.resolve(path.dirname(paths.runManifest), "..", entry.path); assert.equal(fs.statSync(filename).size, entry.byteSize); assert.equal(sha256FileStreaming(filename), entry.sha256); }));
test("16 INTERNAL_TEST count", () => assert.equal(internal.length, 13));
test("17 benchmark count", () => assert.equal(benchmark.length, 140));
test("18 INTERNAL_TEST IDs unique", () => assert.equal(new Set(internal.map((row) => row.exampleId)).size, 13));
test("19 benchmark IDs unique", () => assert.equal(new Set(benchmark.map((row) => row.exampleId)).size, 140));
test("20 labels valid", () => [...internal, ...benchmark].forEach((row) => assert.ok([0, 1].includes(row.trueTarget) && [0, 1].includes(row.predictedTarget))));
test("21 logits finite", () => [...internal, ...benchmark].forEach((row) => assert.ok(Number.isFinite(row.allowLogit) && Number.isFinite(row.blockLogit))));
test("22 scores finite", () => [...internal, ...benchmark].forEach((row) => assert.ok(Number.isFinite(row.allowScore) && Number.isFinite(row.blockScore))));
test("23 scores sum one", () => [...internal, ...benchmark].forEach((row) => assert.ok(Math.abs(row.allowScore + row.blockScore - 1) <= 1e-12)));
test("24 argmax exact", () => [...internal, ...benchmark].forEach((row) => assert.equal(row.predictedTarget, row.allowLogit >= row.blockLogit ? 0 : 1)));
test("25 correctness exact", () => [...internal, ...benchmark].forEach((row) => assert.equal(row.correct, row.trueTarget === row.predictedTarget)));
test("26 raw text absent", () => [...internal, ...benchmark].forEach((row) => assert.equal(Object.prototype.hasOwnProperty.call(row, "text"), false)));
test("27 hashes present", () => [...internal, ...benchmark].forEach((row) => assert.match(row.textSha256, /^[0-9a-f]{64}$/u)));
test("28 prediction schemas validate", () => { assert.doesNotThrow(() => validatePredictionRows(internal, "INTERNAL_TEST", 13)); assert.doesNotThrow(() => validatePredictionRows(benchmark, "EXTERNAL_BENCHMARK", 140)); });
test("29 duplicate rejected", () => assert.throws(() => validatePredictionRows([internal[0], internal[0]], "INTERNAL_TEST", 2), /duplicate/));
test("30 nonfinite rejected", () => { const rows: any[] = [clone(internal[0])]; rows[0].allowLogit = Number.NaN; assert.throws(() => validatePredictionRows(rows, "INTERNAL_TEST", 1), /ALLOW logit/); });
test("31 wrong argmax rejected", () => { const rows: any[] = [clone(internal[0])]; rows[0].predictedTarget = rows[0].predictedTarget === 0 ? 1 : 0; rows[0].predictedDecision = rows[0].predictedTarget === 0 ? "ALLOW" : "BLOCK"; assert.throws(() => validatePredictionRows(rows, "INTERNAL_TEST", 1), /prediction/); });
test("32 raw text rejected", () => { const rows: any[] = [clone(internal[0])]; rows[0].text = "forbidden"; assert.throws(() => validatePredictionRows(rows, "INTERNAL_TEST", 1), /row keys/); });
test("33 INTERNAL_TEST metrics", () => assert.deepEqual(artifact.sourceResults.INTERNAL_TEST.metrics.confusionMatrix, [[8, 1], [1, 3]]));
test("34 benchmark metrics", () => assert.deepEqual(artifact.sourceResults.EXTERNAL_BENCHMARK.metrics.confusionMatrix, [[36, 31], [38, 35]]));
test("35 INTERNAL_TEST errors", () => assert.deepEqual([artifact.sourceResults.INTERNAL_TEST.errors.falsePositiveIds.length, artifact.sourceResults.INTERNAL_TEST.errors.falseNegativeIds.length], [1, 1]));
test("36 benchmark errors", () => assert.deepEqual([artifact.sourceResults.EXTERNAL_BENCHMARK.errors.falsePositiveIds.length, artifact.sourceResults.EXTERNAL_BENCHMARK.errors.falseNegativeIds.length], [31, 38]));
test("37 zero denominator deterministic", () => assert.deepEqual([metricValues([0, 0], [0, 0]).blockPrecision, metricValues([0, 0], [0, 0]).blockRecall, metricValues([0, 0], [0, 0]).blockF1], [0, 0, 0]));
test("38 source metrics independent", () => assert.equal(artifact.integrity.sourcesRemainIndependent, true));
test("39 pooled metric absent", () => assert.equal(artifact.integrity.pooledAuthoritativeMetricCreated, false));
test("40 authorized breakdowns present", () => assert.deepEqual(Object.keys(artifact.sourceResults.EXTERNAL_BENCHMARK.breakdowns).sort(), ["difficulty", "expectedCategory", "language", "tag"]));
test("41 internal warning preserved", () => assert.equal(artifact.sourceResults.INTERNAL_TEST.warning, "SMALL_SAMPLE_HIGH_VARIANCE"));
test("42 privacy certified", () => assert.deepEqual([artifact.privacy.rawProtectedTextPersisted, artifact.privacy.unauthorizedFieldsPersisted, artifact.privacy.unnecessaryPiiPersisted], [false, false, false]));
test("43 reserve and exclusions absent", () => assert.deepEqual([artifact.privacy.reserveContentUsed, artifact.privacy.exclusionOrQuarantineContentUsed], [false, false]));
test("44 protected sources no longer unseen", () => assert.equal(artifact.privacy.protectedSourcesNoLongerUnseenForCandidate, true));
test("45 zero certification execution", () => assert.deepEqual([artifact.boundaries.certificationModelLoads, artifact.boundaries.certificationForwardPasses, artifact.boundaries.certificationProtectedInference], [0, 0, 0]));
test("46 no training or threshold selection", () => assert.deepEqual([artifact.boundaries.trainingRuns, artifact.boundaries.thresholdSelections, artifact.boundaries.productionThresholdStatus], [0, 0, "NOT_SELECTED"]));
test("47 no production decision", () => assert.deepEqual([artifact.boundaries.modelQualityDecision, artifact.boundaries.productionApproval], ["NOT_AUTHORIZED", false]));
test("48 artifact validates", () => assert.doesNotThrow(() => validateMhsV2ControlledEvaluationCertification(artifact)));
test("49 deterministic replay", () => assert.equal(canonicalJson(createMhsV2ControlledEvaluationCertification(paths)), canonicalJson(artifact)));
test("50 immutable publication refuses overwrite", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8d-d-")); try { publishMhsV2ControlledEvaluationCertification(artifact, directory); assert.throws(() => publishMhsV2ControlledEvaluationCertification(artifact, directory), /overwrite refused/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("51 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8d-d-")); try { assert.throws(() => publishMhsV2ControlledEvaluationCertification(artifact, directory, () => { throw new Error("injected"); }), /injected/); assert.equal(fs.existsSync(path.join(directory, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("52 published artifact canonical and pinned", () => { assert.equal(sha256FileStreaming(published), MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256); assert.equal(artifact.certificationPayloadDigest, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST); assert.equal(fs.readFileSync(published, "utf8"), canonicalJson(artifact)); });
test("53 certification source has no ML dependency", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2ControlledEvaluationCertification.ts"), "utf8"); assert.doesNotMatch(source, /torch|transformers|AutoModel|forward\s*\(/u); });
test("54 final status exact", () => assert.equal(artifact.status, "CONTROLLED_EVALUATION_CERTIFIED"));
