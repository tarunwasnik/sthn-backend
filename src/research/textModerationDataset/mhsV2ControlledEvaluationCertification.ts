import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";

export const MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_FIRST_CONTROLLED_EVALUATION_CERTIFICATION_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_VERSION = "MHS_V2_FIRST_CONTROLLED_EVALUATION_CERTIFICATION_V1" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_FILENAME = "mhs-v2-first-controlled-evaluation-certification-v1.json" as const;
export const MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SHA256 = "8a08cb3cd8949b94013f5029003f4193842682b2119be71de394da4cee86c07a";
export const MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST = "cdfcf7b5625dc038883bb7afe542de24447ee769a12dded535901898427ca943";

const CONTRACT_SHA = "1bc3f9a431b445db07c8426267108281d2ed165ffcf229bcd97c4d2174c1022e";
const CONTRACT_PAYLOAD = "9b405c43758029ed58e11d7d877f3e9416ab2171465dcca456194c6ab2a2c79b";
const PREPARATION_SHA = "c556636683ca8fa055cdd3507f0253ebd3f6067876b4a4b66d288093fa44a08d";
const PREPARATION_PAYLOAD = "09737425a488bd242ca4b30ec2a624f6e5f2dcaf0946f2e747d8f3f089bbf41e";
const RUNNER_SHA = "8a8d35298d6ead77b725935af1562dfe9118e6c1c06b514d5a77ed6ef4e1efc0";
const BRIDGE_SHA = "dd6f90fc0e4ff224faf417636108df4a1c591aff7448bfbea125c642c5359525";
const TRAINING_CERTIFICATION_SHA = "43905ea77b4b00cc6d39603f4a6b92480abe796bd547d0109479579270e1372a";
const TRAINING_CERTIFICATION_PAYLOAD = "41892951ce43c5f7b2256fd3c52de9373c596e875eb2c05c01f6707a62377b47";
const TRAINING_MANIFEST_SHA = "b0465888ae65fa085c5b05b330f4241b0c0bf8f8f99562da9e2a4c88fb136e56";
const TRAINING_SUMMARY_SHA = "45c4b9ca6b5f20be06ee6b9468c107156ca4284fe3c75592b12ae9768404b805";
const CANDIDATE_SHA = "3d5106067de09026d0739873734841338812c814211662c0336d68d5aa5a4f79";
const TOKENIZER_SHA = "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c";
const TOKENIZER_BINDING_SHA = "14e87b41020fe70b01b1dfcf4c3250bd2e4f0b49caeaa7c5f8bdc1376f00d654";
const INTERNAL_FREEZE_SHA = "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36";
const INTERNAL_MEMBERSHIP = "618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13";
const BENCHMARK_SHA = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747";
const RUN_MANIFEST_SHA = "e0d8bef728402d9efed635c31da67400d3ea095f38fd715aaa487fac14776718";
const RUN_MANIFEST_PAYLOAD = "52d71642b456a1a2fe2de631d82d138787901a407fb7f96fddb7fa2e9bbcd90e";
const LIFECYCLE_SHA = "8c04a68be03ede88882329fd8436ec40ffba5a6da5e5f238319f61bb151e259e";
const LEDGER_SHA = "23da83c03f5cc5e1b62c448d577046b03faefc3af7b965649c19023f42e2ce1c";
const RESULT_SUMMARY_SHA = "21d4b7002abcdf38b7d45ccd23e5909d9a68a2ff0661161480229942f9e33484";
const INTERNAL_PREDICTIONS_SHA = "c535751b23fd6b51744c01245760d3c92361bb40e97d5e10ccdc16590192c7be";
const INTERNAL_METRICS_SHA = "37e68af5671c64b44d0eca2455da95cb06e07cdc3ea4ad6cbc61c25f201e0b68";
const BENCHMARK_PREDICTIONS_SHA = "4681515a84c42e633a5d22693c9fabf7d432719e31af452c2d7427c320c80743";
const BENCHMARK_METRICS_SHA = "671673bc9b75e25c9d5cdcba46f418b8cb2d70142a71b39361b9a35e3b38fb4c";
const COMBINED_SHA = "b495ad7d58043684f8503192785a92c4b2cf52b1d5ee5b8e8e7192d2ffc83ce1";
const HEX = /^[0-9a-f]{64}$/u;
const PREDICTION_KEYS = ["allowLogit", "allowScore", "blockLogit", "blockScore", "correct", "exampleId", "metadata", "predictedDecision", "predictedTarget", "source", "textSha256", "trueDecision", "trueTarget", "truncated"] as const;

type JsonRecord = Record<string, unknown>;
export interface EvaluationPaths {
  readonly contract: string; readonly preparation: string; readonly trainingCertification: string; readonly runner: string; readonly bridge: string;
  readonly candidate: string; readonly tokenizer: string; readonly tokenizerBinding: string; readonly internalFreeze: string; readonly benchmarkSource: string;
  readonly runManifest: string; readonly lifecycle: string; readonly ledger: string; readonly resultSummary: string;
  readonly internalPredictions: string; readonly internalMetrics: string; readonly benchmarkPredictions: string; readonly benchmarkMetrics: string; readonly combinedAnalysis: string;
}
export interface PredictionRecord {
  readonly source: "INTERNAL_TEST" | "EXTERNAL_BENCHMARK"; readonly exampleId: string; readonly textSha256: string;
  readonly trueDecision: "ALLOW" | "BLOCK"; readonly trueTarget: 0 | 1; readonly predictedDecision: "ALLOW" | "BLOCK"; readonly predictedTarget: 0 | 1;
  readonly allowLogit: number; readonly blockLogit: number; readonly allowScore: number; readonly blockScore: number; readonly correct: boolean; readonly truncated: boolean; readonly metadata: JsonRecord;
}
export interface Metrics {
  readonly count: number; readonly groundTruthCounts: { readonly ALLOW: number; readonly BLOCK: number }; readonly predictedCounts: { readonly ALLOW: number; readonly BLOCK: number };
  readonly confusionMatrix: readonly [readonly [number, number], readonly [number, number]]; readonly accuracy: number;
  readonly allowPrecision: number; readonly allowRecall: number; readonly allowF1: number; readonly blockPrecision: number; readonly blockRecall: number; readonly blockF1: number;
  readonly macroF1: number; readonly balancedAccuracy: number;
}

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const record = (value: unknown, label: string): JsonRecord => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`T6L-8D-D invalid ${label}`); return value as JsonRecord; };
const string = (value: unknown, label: string): string => { if (typeof value !== "string" || value.length === 0) throw new Error(`T6L-8D-D invalid ${label}`); return value; };
const finite = (value: unknown, label: string): number => { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`T6L-8D-D invalid ${label}`); return value; };
const exact = (actual: unknown, expected: unknown, label: string): void => { if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`T6L-8D-D ${label} mismatch`); };
const close = (actual: number, expected: number, label: string): void => { if (Math.abs(actual - expected) > 1e-12) throw new Error(`T6L-8D-D ${label} mismatch`); };
export const sha256FileStreaming = (filename: string): string => {
  const hash = crypto.createHash("sha256"), descriptor = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try { let bytesRead = 0; do { bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead)); } while (bytesRead > 0); }
  finally { fs.closeSync(descriptor); }
  return hash.digest("hex");
};
const assertSha = (filename: string, expected: string, label: string): void => { if (sha256FileStreaming(filename) !== expected) throw new Error(`T6L-8D-D ${label} SHA-256 mismatch`); };
const readJson = (filename: string): JsonRecord => record(JSON.parse(fs.readFileSync(filename, "utf8")), path.basename(filename));
export const readPredictionJsonl = (filename: string): readonly PredictionRecord[] => fs.readFileSync(filename, "utf8").trim().split(/\r?\n/u).map((line) => record(JSON.parse(line), "prediction") as unknown as PredictionRecord);

export const metricValues = (truth: readonly number[], predicted: readonly number[]): Metrics => {
  if (truth.length !== predicted.length || truth.length === 0 || [...truth, ...predicted].some((value) => value !== 0 && value !== 1)) throw new Error("T6L-8D-D invalid metric inputs");
  const cm: [[number, number], [number, number]] = [[0, 0], [0, 0]]; truth.forEach((value, index) => { cm[value][predicted[index]] += 1; });
  const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;
  const precision = (label: 0 | 1): number => ratio(cm[label][label], cm[0][label] + cm[1][label]);
  const recall = (label: 0 | 1): number => ratio(cm[label][label], cm[label][0] + cm[label][1]);
  const f1 = (label: 0 | 1): number => { const p = precision(label), r = recall(label); return ratio(2 * p * r, p + r); };
  return { count: truth.length, groundTruthCounts: { ALLOW: cm[0][0] + cm[0][1], BLOCK: cm[1][0] + cm[1][1] }, predictedCounts: { ALLOW: cm[0][0] + cm[1][0], BLOCK: cm[0][1] + cm[1][1] }, confusionMatrix: cm, accuracy: ratio(cm[0][0] + cm[1][1], truth.length), allowPrecision: precision(0), allowRecall: recall(0), allowF1: f1(0), blockPrecision: precision(1), blockRecall: recall(1), blockF1: f1(1), macroF1: (f1(0) + f1(1)) / 2, balancedAccuracy: (recall(0) + recall(1)) / 2 };
};

const softmax = (left: number, right: number): readonly [number, number] => { const maximum = Math.max(left, right), a = Math.exp(left - maximum), b = Math.exp(right - maximum), total = a + b; return [a / total, b / total]; };
const allowedMetadata: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  INTERNAL_TEST: { primaryCategory: ["ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"] },
  EXTERNAL_BENCHMARK: {
    difficulty: ["ADVERSARIAL", "CONTEXTUAL", "EASY"], domain: ["CREATOR_APPLICATION", "USER_PROFILE"],
    expectedCategory: ["ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"],
    language: ["en", "en-hi", "hi", "hi-Latn", "th"], target: ["bio", "interests[0]", "interests[1]", "interests[2]", "publicBio", "services[0]", "services[1]"],
    tags: ["benign-sensitive-context", "companionship", "creator-service", "harassment", "hate", "marketplace", "multilingual", "nightlife", "obfuscation", "profile", "profanity", "sexual", "threat", "unicode", "violence"],
  },
};

export const validatePredictionRows = (rows: readonly PredictionRecord[], source: PredictionRecord["source"], expectedCount: number, expectedIds?: readonly string[]): void => {
  if (rows.length !== expectedCount) throw new Error(`T6L-8D-D ${source} row count mismatch`);
  const identifiers = new Set<string>();
  rows.forEach((row, index) => {
    exact(Object.keys(row).sort(), [...PREDICTION_KEYS].sort(), `${source} row keys`);
    if (row.source !== source || !string(row.exampleId, "example ID") || identifiers.has(row.exampleId)) throw new Error(`T6L-8D-D ${source} duplicate/invalid ID`); identifiers.add(row.exampleId);
    if (!HEX.test(row.textSha256) || ![0, 1].includes(row.trueTarget) || ![0, 1].includes(row.predictedTarget)) throw new Error(`T6L-8D-D ${source} identity/label mismatch`);
    if (row.trueDecision !== (row.trueTarget === 0 ? "ALLOW" : "BLOCK") || row.predictedDecision !== (row.predictedTarget === 0 ? "ALLOW" : "BLOCK")) throw new Error(`T6L-8D-D ${source} decision mapping mismatch`);
    const allowLogit = finite(row.allowLogit, "ALLOW logit"), blockLogit = finite(row.blockLogit, "BLOCK logit"), allowScore = finite(row.allowScore, "ALLOW score"), blockScore = finite(row.blockScore, "BLOCK score");
    const predicted = allowLogit >= blockLogit ? 0 : 1, scores = softmax(allowLogit, blockLogit);
    if (row.predictedTarget !== predicted || row.correct !== (row.trueTarget === row.predictedTarget) || typeof row.correct !== "boolean" || typeof row.truncated !== "boolean") throw new Error(`T6L-8D-D ${source} prediction/correctness mismatch`);
    close(allowScore, scores[0], `${source} ALLOW score`); close(blockScore, scores[1], `${source} BLOCK score`); close(allowScore + blockScore, 1, `${source} score sum`);
    const metadata = record(row.metadata, `${source} metadata`), policy = allowedMetadata[source]; exact(Object.keys(metadata).sort(), Object.keys(policy).filter((key) => key !== "expectedCategory" && key !== "primaryCategory" || metadata[key] !== undefined).sort(), `${source} metadata keys`);
    Object.entries(metadata).forEach(([key, value]) => { const allowed = policy[key]; if (!allowed) throw new Error(`T6L-8D-D ${source} unauthorized metadata`); if (key === "tags") { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !allowed.includes(item))) throw new Error(`T6L-8D-D ${source} tag mismatch`); } else if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`T6L-8D-D ${source} metadata value mismatch`); });
    if (index < 0) throw new Error("unreachable");
  });
  if (expectedIds) exact([...identifiers].sort(), [...expectedIds].sort(), `${source} membership`);
};

const metricsFromRows = (rows: readonly PredictionRecord[]): Metrics => metricValues(rows.map((row) => row.trueTarget), rows.map((row) => row.predictedTarget));
const validatePersistedMetrics = (actual: Metrics, persistedValue: unknown, source: string): void => {
  const persisted = record(persistedValue, `${source} metrics`);
  exact([persisted.count, persisted.groundTruthCounts, persisted.predictedCounts, persisted.confusionMatrix], [actual.count, actual.groundTruthCounts, actual.predictedCounts, actual.confusionMatrix], `${source} metric counts`);
  (["accuracy", "allowPrecision", "allowRecall", "allowF1", "blockPrecision", "blockRecall", "blockF1", "macroF1", "balancedAccuracy"] as const).forEach((key) => close(finite(persisted[key], key), actual[key], `${source} ${key}`));
};
const groupMetrics = (rows: readonly PredictionRecord[], selector: (row: PredictionRecord) => readonly string[]): Readonly<Record<string, Metrics>> => {
  const groups = new Map<string, PredictionRecord[]>(); rows.forEach((row) => selector(row).forEach((key) => groups.set(key, [...(groups.get(key) ?? []), row])));
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => [key, metricsFromRows(group)]));
};
const metadataString = (row: PredictionRecord, key: string): string => typeof row.metadata[key] === "string" ? row.metadata[key] as string : "NONE";
const errorEvidence = (rows: readonly PredictionRecord[]) => ({ falsePositiveIds: rows.filter((row) => row.trueTarget === 0 && row.predictedTarget === 1).map((row) => row.exampleId), falseNegativeIds: rows.filter((row) => row.trueTarget === 1 && row.predictedTarget === 0).map((row) => row.exampleId) });

export const defaultControlledEvaluationCertificationPaths = (root = process.cwd()): EvaluationPaths => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), training = path.resolve(root, "evaluation-cache/text-moderation/classifier-training/mhs-v2-xlm-roberta-first-run-v1"), cache = path.resolve(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089"), output = path.resolve(root, "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1");
  return { contract: path.join(mhs, "training/mhs-v2-controlled-evaluation-contract-v1.json"), preparation: path.join(mhs, "training/mhs-v2-controlled-evaluation-runner-preparation-v1.json"), trainingCertification: path.join(mhs, "training/mhs-v2-first-local-training-run-certification-v1.json"), runner: path.resolve(root, "src/research/textModerationDataset/training/run_mhs_v2_controlled_evaluation.py"), bridge: path.resolve(root, "src/scripts/readMhsV2ProtectedEvaluationSource.ts"), candidate: path.join(training, "final/model.safetensors"), tokenizer: path.join(cache, "tokenizer.json"), tokenizerBinding: path.join(training, "final/tokenizer-binding.json"), internalFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), benchmarkSource: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts"), runManifest: path.join(output, "run/run-manifest.json"), lifecycle: path.join(output, "run/lifecycle.json"), ledger: path.join(output, "run/protected-exposure-ledger.jsonl"), resultSummary: path.join(output, "run/result-summary.json"), internalPredictions: path.join(output, "internal-test/predictions.jsonl"), internalMetrics: path.join(output, "internal-test/metrics.json"), benchmarkPredictions: path.join(output, "external-benchmark/predictions.jsonl"), benchmarkMetrics: path.join(output, "external-benchmark/metrics.json"), combinedAnalysis: path.join(output, "analysis/combined-analysis.json") };
};

export const createMhsV2ControlledEvaluationCertification = (paths: EvaluationPaths): JsonRecord => {
  const pinned: readonly [string, string, string][] = [[paths.contract, CONTRACT_SHA, "8D-A contract"], [paths.preparation, PREPARATION_SHA, "8D-B preparation"], [paths.trainingCertification, TRAINING_CERTIFICATION_SHA, "8C3 certification"], [paths.runner, RUNNER_SHA, "runner"], [paths.bridge, BRIDGE_SHA, "bridge"], [paths.candidate, CANDIDATE_SHA, "candidate"], [paths.tokenizer, TOKENIZER_SHA, "tokenizer"], [paths.tokenizerBinding, TOKENIZER_BINDING_SHA, "tokenizer binding"], [paths.internalFreeze, INTERNAL_FREEZE_SHA, "INTERNAL_TEST freeze"], [paths.benchmarkSource, BENCHMARK_SHA, "benchmark"], [paths.runManifest, RUN_MANIFEST_SHA, "run manifest"], [paths.lifecycle, LIFECYCLE_SHA, "lifecycle"], [paths.ledger, LEDGER_SHA, "exposure ledger"], [paths.resultSummary, RESULT_SUMMARY_SHA, "result summary"], [paths.internalPredictions, INTERNAL_PREDICTIONS_SHA, "INTERNAL_TEST predictions"], [paths.internalMetrics, INTERNAL_METRICS_SHA, "INTERNAL_TEST metrics"], [paths.benchmarkPredictions, BENCHMARK_PREDICTIONS_SHA, "benchmark predictions"], [paths.benchmarkMetrics, BENCHMARK_METRICS_SHA, "benchmark metrics"], [paths.combinedAnalysis, COMBINED_SHA, "combined analysis"]];
  pinned.forEach(([filename, expected, label]) => assertSha(filename, expected, label));
  const contract = readJson(paths.contract), preparation = readJson(paths.preparation), trainingCertification = readJson(paths.trainingCertification), manifest = readJson(paths.runManifest), lifecycle = readJson(paths.lifecycle), summary = readJson(paths.resultSummary), internalPersisted = readJson(paths.internalMetrics), benchmarkPersisted = readJson(paths.benchmarkMetrics), combined = readJson(paths.combinedAnalysis);
  exact([contract.contractPayloadDigest, contract.status, preparation.preparationPayloadDigest, preparation.status, trainingCertification.certificationPayloadDigest, trainingCertification.status], [CONTRACT_PAYLOAD, "CONTROLLED_EVALUATION_CONTRACT_READY", PREPARATION_PAYLOAD, "LOCAL_CONTROLLED_EVALUATION_READY", TRAINING_CERTIFICATION_PAYLOAD, "FIRST_TRAINING_RUN_CERTIFIED"], "upstream authority payloads/statuses");
  const { runPayloadDigest, ...manifestPayload } = manifest; if (runPayloadDigest !== RUN_MANIFEST_PAYLOAD || digest(manifestPayload) !== RUN_MANIFEST_PAYLOAD) throw new Error("T6L-8D-D run manifest payload mismatch");
  const manifestAuthorities = record(manifest.authorities, "manifest authorities"), configuration = record(manifest.configuration, "configuration"), sources = record(manifest.sources, "sources");
  exact(manifestAuthorities, { candidateSha256: CANDIDATE_SHA, controlledEvaluationContractPayloadDigest: CONTRACT_PAYLOAD, controlledEvaluationContractSha256: CONTRACT_SHA, externalBenchmarkSha256: BENCHMARK_SHA, externalBenchmarkVersion: "STHN_TEXT_MODERATION_FIXTURES_V1R", internalTestFreezeSha256: INTERNAL_FREEZE_SHA, internalTestMembershipDigest: INTERNAL_MEMBERSHIP, tokenizerSha256: TOKENIZER_SHA, trainingCertificationSha256: TRAINING_CERTIFICATION_SHA }, "manifest authorities");
  exact(configuration, { batchSize: 8, decisionRule: "ARGMAX_TWO_LOGITS", device: "CPU", gradients: false, implementationRule: "ARGMAX_ALLOW_LOGIT_BLOCK_LOGIT", maxLength: 160, modelEval: true, optimizer: null, precision: "FP32", productionThresholdStatus: "NOT_SELECTED", scheduler: null, shuffle: false, tieRule: "LOWEST_LABEL_INDEX_ALLOW" }, "execution configuration");
  exact([manifest.phase, manifest.terminalStatus, manifest.trainingRuns, manifest.thresholdSelections, manifest.protectedExposureIrreversible], ["T6L-8D-C", "COMPLETED", 0, 0, true], "manifest terminal state");
  exact([lifecycle.phase, lifecycle.status, lifecycle.contractSha256, lifecycle.candidateSha256, lifecycle.internalTestAccessed, lifecycle.internalTestEvaluated, lifecycle.benchmarkAccessed, lifecycle.benchmarkEvaluated, lifecycle.runManifestSha256, lifecycle.resultSummarySha256], ["T6L-8D-C", "COMPLETED", CONTRACT_SHA, CANDIDATE_SHA, true, true, true, true, RUN_MANIFEST_SHA, RESULT_SUMMARY_SHA], "lifecycle state");
  exact([summary.status, summary.runManifestSha256, summary.internalTestCount, summary.externalBenchmarkCount, summary.sourceMetricsRemainIndependent, summary.modelQualityDecision, summary.productionThresholdStatus, summary.trainingRuns, summary.thresholdSelections], ["CONTROLLED_EVALUATION_COMPLETED", RUN_MANIFEST_SHA, 13, 140, true, "NOT_AUTHORIZED", "NOT_SELECTED", 0, 0], "result summary");
  const ledger = fs.readFileSync(paths.ledger, "utf8").trim().split(/\r?\n/u).map((line) => record(JSON.parse(line), "exposure event")); exact(ledger.map((event) => [event.ordinal, event.source, event.event, event.rawTextIncluded]), [[1, "INTERNAL_TEST", "INTERNAL_TEST_ACCESS_STARTED", false], [2, "INTERNAL_TEST", "INTERNAL_TEST_EVALUATION_COMPLETED", false], [3, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_ACCESS_STARTED", false], [4, "EXTERNAL_BENCHMARK", "EXTERNAL_BENCHMARK_EVALUATION_COMPLETED", false]], "exposure sequence");
  const expectedEvidence = [{ path: "run/protected-exposure-ledger.jsonl", byteSize: 832, sha256: LEDGER_SHA }, { path: "internal-test/predictions.jsonl", byteSize: 6053, sha256: INTERNAL_PREDICTIONS_SHA }, { path: "internal-test/metrics.json", byteSize: 661, sha256: INTERNAL_METRICS_SHA }, { path: "external-benchmark/predictions.jsonl", byteSize: 78620, sha256: BENCHMARK_PREDICTIONS_SHA }, { path: "external-benchmark/metrics.json", byteSize: 677, sha256: BENCHMARK_METRICS_SHA }, { path: "analysis/combined-analysis.json", byteSize: 527, sha256: COMBINED_SHA }]; exact(manifest.artifacts, expectedEvidence, "manifest evidence index");
  const freeze = readJson(paths.internalFreeze), identityIndex = freeze.candidateIdentityIndex; if (!Array.isArray(identityIndex) || identityIndex.length !== 13) throw new Error("T6L-8D-D INTERNAL_TEST freeze index mismatch"); const internalIds = identityIndex.map((item) => string(record(item, "freeze identity").candidateId, "candidate ID"));
  const internalRows = readPredictionJsonl(paths.internalPredictions), benchmarkRows = readPredictionJsonl(paths.benchmarkPredictions); validatePredictionRows(internalRows, "INTERNAL_TEST", 13, internalIds); validatePredictionRows(benchmarkRows, "EXTERNAL_BENCHMARK", 140, Array.from({ length: 140 }, (_, index) => `sthn-tm-${String(index + 1).padStart(3, "0")}`));
  identityIndex.forEach((item, index) => { const identity = record(item, "freeze identity"); if (internalRows[index].exampleId !== identity.candidateId || internalRows[index].textSha256 !== identity.textDigest) throw new Error("T6L-8D-D INTERNAL_TEST text binding mismatch"); });
  const internalMetrics = metricsFromRows(internalRows), benchmarkMetrics = metricsFromRows(benchmarkRows); validatePersistedMetrics(internalMetrics, internalPersisted, "INTERNAL_TEST"); validatePersistedMetrics(benchmarkMetrics, benchmarkPersisted, "EXTERNAL_BENCHMARK"); validatePersistedMetrics(internalMetrics, sources.INTERNAL_TEST, "manifest INTERNAL_TEST"); validatePersistedMetrics(benchmarkMetrics, sources.EXTERNAL_BENCHMARK, "manifest benchmark");
  exact([internalPersisted.warning, internalPersisted.truncationCount, benchmarkPersisted.sourceVersion, benchmarkPersisted.truncationCount], ["INTERNAL_TEST_HAS_13_ROWS_HIGH_SAMPLING_VARIANCE_NO_PASS_FAIL_QUALITY_THRESHOLD", 0, "STHN_TEXT_MODERATION_FIXTURES_V1R", 0], "source caveats");
  exact(combined, { independentMetricsPreserved: true, pooledQualityMetric: null, productionThresholdStatus: "NOT_SELECTED", qualityDecision: "NOT_AUTHORIZED_IN_T6L_8D_C", schemaVersion: "STHN_MHS_V2_CONTROLLED_EVALUATION_COMBINED_ANALYSIS_V1", sourceWeighting: null, sources: [{ count: 13, metrics: "internal-test/metrics.json", source: "INTERNAL_TEST" }, { count: 140, metrics: "external-benchmark/metrics.json", source: "EXTERNAL_BENCHMARK" }] }, "source-preserving combined analysis");
  const payload: JsonRecord = {
    schemaVersion: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_VERSION, phase: "T6L-8D-D", status: "CONTROLLED_EVALUATION_CERTIFIED",
    authorities: { controlledEvaluationContract: { sha256: CONTRACT_SHA, payloadDigest: CONTRACT_PAYLOAD }, runnerPreparation: { sha256: PREPARATION_SHA, payloadDigest: PREPARATION_PAYLOAD, runnerSha256: RUNNER_SHA, protectedSourceBridgeSha256: BRIDGE_SHA }, trainingCertification: { sha256: TRAINING_CERTIFICATION_SHA, payloadDigest: TRAINING_CERTIFICATION_PAYLOAD, runManifestSha256: TRAINING_MANIFEST_SHA, resultSummarySha256: TRAINING_SUMMARY_SHA }, candidate: { repository: "FacebookAI/xlm-roberta-base", revision: "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089", selectedEpoch: 3, checkpoint: "checkpoints/checkpoint-epoch-03", sha256: CANDIDATE_SHA }, tokenizer: { implementation: "XLMRobertaTokenizerFast", sha256: TOKENIZER_SHA, bindingSha256: TOKENIZER_BINDING_SHA }, internalTest: { freezeSha256: INTERNAL_FREEZE_SHA, membershipDigest: INTERNAL_MEMBERSHIP, count: 13, ALLOW: 9, BLOCK: 4 }, externalBenchmark: { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: BENCHMARK_SHA, count: 140 } },
    run: { outputRoot: "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1", runManifest: { sha256: RUN_MANIFEST_SHA, payloadDigest: RUN_MANIFEST_PAYLOAD }, lifecycle: { sha256: LIFECYCLE_SHA, status: "COMPLETED", startedAt: lifecycle.startedAt, completedAt: lifecycle.completedAt }, exposureLedger: { sha256: LEDGER_SHA, events: ledger.map((event) => ({ ordinal: event.ordinal, source: event.source, event: event.event })) }, resultSummary: { sha256: RESULT_SUMMARY_SHA, status: "CONTROLLED_EVALUATION_COMPLETED" }, evidence: expectedEvidence },
    configuration: { device: "CPU", precision: "FP32", batchSize: 8, maxLength: 160, padding: "DYNAMIC_RIGHT", truncation: "DETERMINISTIC_RIGHT", unicode: "EXACT_PRESERVATION", translation: false, transliteration: false, normalization: false, semanticRewriting: false, labels: { ALLOW: 0, BLOCK: 1 }, decisionRule: "ARGMAX_TWO_LOGITS", tieRule: "LOWEST_LABEL_INDEX_ALLOW", modelEval: true, gradients: false, shuffle: false, optimizer: null, scheduler: null },
    sourceResults: {
      INTERNAL_TEST: { metrics: internalMetrics, errors: errorEvidence(internalRows), truncationCount: 0, breakdowns: { primaryCategory: groupMetrics(internalRows, (row) => [metadataString(row, "primaryCategory")]) }, warning: "SMALL_SAMPLE_HIGH_VARIANCE", noQualityPassFailThreshold: true },
      EXTERNAL_BENCHMARK: { metrics: benchmarkMetrics, errors: errorEvidence(benchmarkRows), truncationCount: 0, breakdowns: { difficulty: groupMetrics(benchmarkRows, (row) => [metadataString(row, "difficulty")]), language: groupMetrics(benchmarkRows, (row) => [metadataString(row, "language")]), expectedCategory: groupMetrics(benchmarkRows, (row) => [metadataString(row, "expectedCategory")]), tag: groupMetrics(benchmarkRows, (row) => row.metadata.tags as readonly string[]) } },
    },
    integrity: { manifestEvidenceFilesVerified: 6, predictionRowsVerified: 153, uniqueIdsVerified: true, labelsVerified: true, finiteLogitsVerified: true, finiteScoresVerified: true, softmaxScoresVerified: true, argmaxAndTieRuleVerified: true, correctnessVerified: true, textHashesVerified: true, persistedMetricsMatchRecomputation: true, sourcesRemainIndependent: true, pooledAuthoritativeMetricCreated: false },
    privacy: { rawProtectedTextPersisted: false, unauthorizedFieldsPersisted: false, unnecessaryPiiPersisted: false, reserveContentUsed: false, exclusionOrQuarantineContentUsed: false, protectedSourcesNoLongerUnseenForCandidate: true },
    boundaries: { certificationModelLoads: 0, certificationForwardPasses: 0, certificationProtectedInference: 0, trainingRuns: 0, thresholdSelections: 0, productionThresholdStatus: "NOT_SELECTED", modelQualityDecision: "NOT_AUTHORIZED", productionApproval: false },
    limitations: ["INTERNAL_TEST_HAS_13_ROWS_SMALL_SAMPLE_HIGH_VARIANCE", "EXTERNAL_BENCHMARK_IS_A_FIXED_PROTECTED_FIXTURE_SET", "ALLOW_AND_BLOCK_SCORES_ARE_UNCALIBRATED_MODEL_SCORES", "NO_PRODUCTION_ACCEPTANCE_THRESHOLD_WAS_FROZEN", "CERTIFICATION_IS_EXECUTION_EVIDENCE_INTEGRITY_NOT_PRODUCTION_APPROVAL", "INTERNAL_TEST_AND_BENCHMARK_ARE_NO_LONGER_UNSEEN_FOR_THIS_CANDIDATE"],
    certifiedAt: lifecycle.completedAt,
  };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2ControlledEvaluationCertification(artifact); return artifact;
};

export const validateMhsV2ControlledEvaluationCertification = (artifact: JsonRecord): void => {
  const payloadDigest = artifact.certificationPayloadDigest, payload = { ...artifact }; delete payload.certificationPayloadDigest;
  if (artifact.schemaVersion !== MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_VERSION || artifact.phase !== "T6L-8D-D" || artifact.status !== "CONTROLLED_EVALUATION_CERTIFIED" || payloadDigest !== digest(payload)) throw new Error("Invalid T6L-8D-D certification identity/payload");
  if (payloadDigest !== MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST) throw new Error("Invalid T6L-8D-D pinned payload digest");
  const boundaries = record(artifact.boundaries, "boundaries"), privacy = record(artifact.privacy, "privacy"), integrity = record(artifact.integrity, "integrity");
  exact(boundaries, { certificationForwardPasses: 0, certificationModelLoads: 0, certificationProtectedInference: 0, modelQualityDecision: "NOT_AUTHORIZED", productionApproval: false, productionThresholdStatus: "NOT_SELECTED", thresholdSelections: 0, trainingRuns: 0 }, "certification boundaries");
  if (privacy.rawProtectedTextPersisted !== false || privacy.unauthorizedFieldsPersisted !== false || privacy.reserveContentUsed !== false || privacy.exclusionOrQuarantineContentUsed !== false || privacy.protectedSourcesNoLongerUnseenForCandidate !== true || integrity.pooledAuthoritativeMetricCreated !== false || Object.entries(integrity).some(([key, value]) => key !== "pooledAuthoritativeMetricCreated" && value === false)) throw new Error("Invalid T6L-8D-D privacy/integrity certification");
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2ControlledEvaluationCertification = (artifact: JsonRecord, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2ControlledEvaluationCertification(artifact); fs.mkdirSync(outputDirectory, { recursive: true }); const target = path.join(outputDirectory, MHS_V2_CONTROLLED_EVALUATION_CERTIFICATION_FILENAME); if (fs.existsSync(target)) throw new Error("T6L-8D-D certification exists; overwrite refused"); const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete T6L-8D-D certification publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
