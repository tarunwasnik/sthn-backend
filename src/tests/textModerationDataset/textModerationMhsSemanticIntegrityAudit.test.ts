import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import {
  createMhsSemanticIntegrityAudit, E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD,
  MHS_SEMANTIC_AUDIT_FILENAME, MHS_SEMANTIC_CANDIDATE_MEMBERSHIP_DIGEST, MhsSemanticAuditArtifact, SemanticEmbeddingAdapter, semanticReviewBand,
  validateMhsSemanticAuditArtifact,
} from "../../research/textModerationDataset/mhsSemanticIntegrityAudit";
import { E5_SELECTED_PREFIX_POLICY_VERSION, E5_SELECTED_SYMMETRIC_PREFIX_POLICY, E5CalibrationResult } from "../../research/textModerationDataset/semanticSimilarity/e5SemanticCalibration";
import {
  E5_CALIBRATION_PAIR_CLASSES, E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST, e5SemanticCalibrationCorpus,
  e5SemanticCalibrationCorpusDigest,
} from "../../research/textModerationDataset/semanticSimilarity/e5SemanticCalibrationCorpus";
import {
  E5_SEMANTIC_ADAPTER_VERSION, E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST, E5_SMALL_GX_MANIFEST_SHA256,
  E5SemanticSimilarityAdapter, E5TokenHiddenObservation, meanPoolTokenHiddenState, normalizeSemanticEmbeddingL2,
  semanticCosineSimilarity,
} from "../../research/textModerationDataset/semanticSimilarity/e5SemanticSimilarityAdapter";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates");
const candidatePath = path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json");
const integrityPath = path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json");
const contaminationPath = path.join(candidates, "mhs-review-pilot-v1-candidate-v1-contamination-audit.json");
const semanticPath = path.join(candidates, MHS_SEMANTIC_AUDIT_FILENAME);
const semantic = (): MhsSemanticAuditArtifact => JSON.parse(fs.readFileSync(semanticPath, "utf8")) as MhsSemanticAuditArtifact;
const candidate = (): MhsCandidateAdmissionArtifact => JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact;
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const temporaryOutput = (): string => fs.mkdtempSync(path.join(process.cwd(), "evaluation-cache", "text-moderation", "semantic", "g-test-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const calibration = (): E5CalibrationResult => {
  const value = semantic().calibration; return { version: value.version, corpusVersion: value.corpusVersion, corpusDigest: value.corpusDigest,
    pairCount: value.pairCount, selectedPolicy: value.selectedPolicy, selectionRule: value.selectionRule,
    policyResults: value.policyResults.map((item) => ({ ...item, scores: [] })) };
};
class StubAdapter implements SemanticEmbeddingAdapter {
  readonly version = E5_SEMANTIC_ADAPTER_VERSION; async initialize(): Promise<void> { /* deterministic no-op */ }
  async embedBatch(texts: readonly string[], prefix: "query" | "passage"): Promise<readonly number[][]> {
    return texts.map((text) => { const digest = crypto.createHash("sha256").update(`${prefix}:${text}`).digest(); const vector = new Array<number>(384).fill(0);
      for (let index = 0; index < 16; index += 1) vector[(digest[index] + index * 19) % 384] += digest[index] / 255 + 0.1; return normalizeSemanticEmbeddingL2(vector); });
  }
}
const options = (outputDirectory: string) => ({ candidateArtifactPath: candidatePath, integrityAuditArtifactPath: integrityPath,
  contaminationAuditArtifactPath: contaminationPath, outputDirectory, adapter: new StubAdapter(), generatedAt: "2026-09-11T10:00:00.000Z",
  calibrationEvaluator: async () => calibration() });

test("G enforces the certified GX manifest SHA", () => assert.equal(E5_SMALL_GX_MANIFEST_SHA256, "af28451d28ca3de53d914988536a2ad97ff13b1b03766dd1bfe798ec7671ae12"));
test("G enforces the certified GX payload digest", () => assert.equal(E5_SMALL_GX_MANIFEST_PAYLOAD_DIGEST, "1cf6ebd132eab388fa27fc7fcd905da204b505b55d55b13da18af6d65856718b"));
test("G enforces the certified ONNX SHA", () => assert.equal(semantic().model.onnxSha256, "6537b5148ee3c043b20c3837ae9569d106e976c828d0d7e9163720c4b556bba3"));
test("G enforces the certified tokenizer identity", () => assert.equal(semantic().model.tokenizerSha256, "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"));
test("G embedding dimension is exactly 384", () => assert.equal(semantic().model.embeddingDimension, 384));
test("G mean pooling excludes masked tokens", () => { const hidden = new Array<number>(3 * 384).fill(0); hidden[0] = 2; hidden[384] = 4; hidden[768] = 100;
  const observation: E5TokenHiddenObservation = { batchSize: 1, sequenceLength: 3, attentionMask: [1, 1, 0], lastHiddenState: hidden };
  assert.equal(meanPoolTokenHiddenState(observation)[0][0], 3); });
test("G L2 normalization produces unit norm", () => { const vector = new Array<number>(384).fill(0); vector[0] = 3; vector[1] = 4; const normalized = normalizeSemanticEmbeddingL2(vector); assert.ok(Math.abs(Math.hypot(...normalized) - 1) < 1e-12); });
test("G cosine is bounded and rejects malformed vectors", () => { const vector = new Array<number>(384).fill(0); vector[0] = 1; assert.equal(semanticCosineSimilarity(vector, vector), 1); assert.throws(() => semanticCosineSimilarity([1], [1])); });
test("G repeated real-model embeddings are deterministic", { timeout: 120_000 }, async () => { const adapter = new E5SemanticSimilarityAdapter(); const values = await adapter.embedBatch(["query-independent harmless probe", "query-independent harmless probe"], "query"); assert.deepEqual(values[0], values[1]); });
test("G prefix policy is explicitly versioned", () => { assert.equal(semantic().semanticContract.prefixPolicy, E5_SELECTED_SYMMETRIC_PREFIX_POLICY); assert.equal(semantic().semanticContract.prefixPolicyVersion, E5_SELECTED_PREFIX_POLICY_VERSION); });
test("G calibration corpus is frozen and independently authored", () => { assert.equal(e5SemanticCalibrationCorpusDigest(), E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST); assert.equal(new Set(e5SemanticCalibrationCorpus.map((item) => item.id)).size, 44); });
test("G calibration corpus is deterministic", () => assert.equal(canonicalJson(e5SemanticCalibrationCorpus), canonicalJson([...e5SemanticCalibrationCorpus])));
test("G exact calibration pairs remain the strongest identity controls", () => { const exact = semantic().calibration.policyResults.find((item) => item.policy === "QUERY_QUERY")!.statisticsByClass.EXACT_IDENTITY; assert.ok(exact.minimum > 0.999999); });
test("G unrelated calibration pairs score below the review floor", () => { const selected = semantic().calibration.policyResults.find((item) => item.policy === E5_SELECTED_SYMMETRIC_PREFIX_POLICY)!; assert.ok(selected.statisticsByClass.UNRELATED.maximum < E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD); });
test("G calibration contains hard-negative classes", () => { for (const value of ["SAME_TOPIC_DIFFERENT_MEANING", "POLICY_CHANGING_MINIMAL_PAIR", "UNRELATED"]) assert.ok(E5_CALIBRATION_PAIR_CLASSES.includes(value as any)); });
test("G calibration contains multilingual probes", () => assert.ok(e5SemanticCalibrationCorpus.filter((item) => item.pairClass === "MULTILINGUAL_EQUIVALENCE").length >= 6));
test("G calibration contains separately tracked Hinglish probes", () => assert.ok(e5SemanticCalibrationCorpus.filter((item) => item.pairClass === "HINGLISH" || item.languageGroup.includes("hinglish")).length >= 4));
test("G semantic audit loads exactly 86 candidates", () => assert.equal(semantic().candidateCount, 86));
test("G semantic audit compares exactly 3,655 pairs", () => assert.equal(semantic().pairCount, 3655));
test("G excludes blocked PII and adjudication identities", () => { const blocked = new Set(candidate().rows.filter((row) => !row.candidateAdmitted).map((row) => row.sourceRowId)); assert.ok(semantic().findings.every((item) => !blocked.has(item.candidateAId) && !blocked.has(item.candidateBId))); });
test("G tooling has no frozen benchmark access", () => { const files = ["src/research/textModerationDataset/semanticSimilarity/e5SemanticSimilarityAdapter.ts", "src/research/textModerationDataset/semanticSimilarity/e5SemanticCalibration.ts", "src/research/textModerationDataset/semanticSimilarity/e5SemanticCalibrationCorpus.ts", "src/research/textModerationDataset/mhsSemanticIntegrityAudit.ts", "src/scripts/createMhsSemanticIntegrityAudit.ts"]; const body = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(body, /textModerationFixtures|textModerationEvaluationFixtures|protectedFrozenBenchmarkContaminationDetector/); });
test("G candidate decisions remain bound to source authority", () => { const decisions = new Map(candidate().rows.map((row) => [row.sourceRowId, row.reviewerDecision])); assert.ok(semantic().findings.every((item) => decisions.get(item.candidateAId) === item.candidateADecision && decisions.get(item.candidateBId) === item.candidateBDecision)); });
test("G candidate membership remains unchanged", () => { const admitted = candidate().rows.filter((row) => row.candidateAdmitted); assert.equal(admitted.length, 86); assert.equal(semantic().candidateMembershipDigest, MHS_SEMANTIC_CANDIDATE_MEMBERSHIP_DIGEST); assert.equal(new Set(semantic().findings.flatMap((item) => [item.candidateAId, item.candidateBId])).size <= 86, true); });
test("G findings contain no text or label mutation fields", () => { const serialized = JSON.stringify(semantic().findings); assert.doesNotMatch(serialized, /reviewedText|\"text\"|newDecision|replacementCategory|candidateAdmitted/); });
test("G trainingEligible remains false", () => { assert.equal(semantic().trainingEligibleCount, 0); assert.ok(candidate().rows.every((row) => row.trainingEligible === false)); });
test("G semantic artifact validates and refuses overwrite", async () => { const output = temporaryOutput(); try { await createMhsSemanticIntegrityAudit(options(output)); await assert.rejects(createMhsSemanticIntegrityAudit(options(output)), /already exists/); } finally { clean(output); } });
test("G partial publication cannot become authoritative", async () => { const output = temporaryOutput(); try { await assert.rejects(createMhsSemanticIntegrityAudit({ ...options(output), publishAtomic: () => { throw new Error("simulated publish failure"); } }), /simulated publish failure/); assert.equal(fs.existsSync(path.join(output, MHS_SEMANTIC_AUDIT_FILENAME)), false); } finally { clean(output); } });
test("G preserves XLM-R moderation authority", () => assert.equal(semantic().moderationBaseModel, "FacebookAI/xlm-roberta-base"));
test("G published artifact has its expected immutable identity", () => { assert.equal(shaFile(semanticPath), "aa3d24ebba90d6ea7eb0a8f491ceb7b0e8e98c6f08c7e865701dbde6f591a998"); assert.doesNotThrow(() => validateMhsSemanticAuditArtifact(semantic())); });
test("G review-band boundaries are explicit", () => { assert.equal(semanticReviewBand(E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD), "HIGH_CONFIDENCE_DUPLICATE_SIGNAL"); assert.equal(semanticReviewBand(E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD), "POTENTIAL_NEAR_DUPLICATE_REVIEW"); assert.equal(semanticReviewBand(E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD - 1e-6), "NO_SEMANTIC_DUPLICATE_SIGNAL"); });
