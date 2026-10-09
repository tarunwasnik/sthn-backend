import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareCandidatesToProtectedFrozenBenchmark, FROZEN_TEXT_MODERATION_FIXTURE_COUNT, FROZEN_TEXT_MODERATION_FIXTURE_SHA256,
  PROTECTED_CONTAMINATION_DETECTOR_VERSION, PROTECTED_FUZZY_DETECTOR_VERSION, PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH,
  PROTECTED_FUZZY_THRESHOLD,
} from "../../evaluation/textModeration/protectedFrozenBenchmarkContaminationDetector";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION } from "../../research/textModerationDataset/identity";
import {
  createMhsProtectedContaminationAudit, MHS_CONTAMINATION_AUDIT_FILENAME, MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256,
  MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION, MHS_SEMANTIC_TOOLING_STATUS, ProtectedDetectorFinding,
  ProtectedDetectorInput, ProtectedDetectorResult, validateMhsProtectedContaminationAuditArtifact,
} from "../../research/textModerationDataset/mhsProtectedContaminationAudit";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const candidatePath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json");
const integrityPath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1-integrity-audit.json");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const reviewerPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-validated.json");
const resolutionPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-resolution.json");
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const temporaryDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-contamination-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const options = (directory: string, candidateArtifactPath = candidatePath, integrityAuditArtifactPath = integrityPath,
  protectedDetector: (candidates: readonly ProtectedDetectorInput[]) => ProtectedDetectorResult = compareCandidatesToProtectedFrozenBenchmark) => ({ candidateArtifactPath, integrityAuditArtifactPath,
  outputDirectory: path.join(directory, "candidates"), protectedDetector, generatedAt: "2026-09-11T16:00:00.000Z" });
const candidate = (): any => JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const admittedInputs = (): readonly { candidateRowId: string; candidateTextDigest: string; text: string }[] => candidate().rows.filter((row: any) => row.candidateAdmitted)
  .map((row: any) => ({ candidateRowId: row.sourceRowId, candidateTextDigest: row.textDigest, text: row.reviewedText }));
const emptyResult = (count = 86, findings: readonly ProtectedDetectorFinding[] = []): ProtectedDetectorResult => ({
  detectorVersion: PROTECTED_CONTAMINATION_DETECTOR_VERSION, fixtureVersion: "STHN_TEXT_MODERATION_FIXTURES_V1R",
  fixturePublishedSha256: FROZEN_TEXT_MODERATION_FIXTURE_SHA256, fixtureCount: FROZEN_TEXT_MODERATION_FIXTURE_COUNT,
  normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, fuzzyDetectorVersion: PROTECTED_FUZZY_DETECTOR_VERSION,
  fuzzyThreshold: PROTECTED_FUZZY_THRESHOLD, fuzzyMinimumNormalizedLength: PROTECTED_FUZZY_MINIMUM_NORMALIZED_LENGTH,
  comparedCandidateCount: count, findings,
});

test("T6L-6J-F protected detector loads valid candidate authority", () => { const directory = temporaryDirectory(); try { const result = createMhsProtectedContaminationAudit(options(directory)); assert.equal(result.artifact.schemaVersion, MHS_PROTECTED_CONTAMINATION_AUDIT_SCHEMA_VERSION); assert.doesNotThrow(() => validateMhsProtectedContaminationAuditArtifact(JSON.parse(fs.readFileSync(result.artifactPath, "utf8")))); } finally { clean(directory); } });

test("T6L-6J-F candidate SHA is verified", () => { const directory = temporaryDirectory(); try { const changed = path.join(directory, "candidate.json"); fs.writeFileSync(changed, `${fs.readFileSync(candidatePath, "utf8")} `); assert.throws(() => createMhsProtectedContaminationAudit(options(directory, changed)), /SHA-256 mismatch/); } finally { clean(directory); } });

test("T6L-6J-F integrity-audit SHA is verified", () => { assert.equal(shaFile(integrityPath), MHS_INTEGRITY_AUDIT_ARTIFACT_SHA256); const directory = temporaryDirectory(); try { const changed = path.join(directory, "integrity.json"); fs.writeFileSync(changed, `${fs.readFileSync(integrityPath, "utf8")} `); assert.throws(() => createMhsProtectedContaminationAudit(options(directory, candidatePath, changed)), /SHA-256 mismatch/); } finally { clean(directory); } });

test("T6L-6J-F frozen fixture version, count and published SHA are verified", () => { const result = compareCandidatesToProtectedFrozenBenchmark([]); assert.equal(result.fixtureVersion, "STHN_TEXT_MODERATION_FIXTURES_V1R"); assert.equal(result.fixtureCount, 140); assert.equal(result.fixturePublishedSha256, "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747"); });

test("T6L-6J-F compares only 86 admitted candidates", () => { const inputs = admittedInputs(); assert.equal(inputs.length, 86); assert.equal(compareCandidatesToProtectedFrozenBenchmark(inputs).comparedCandidateCount, 86); });

test("T6L-6J-F exact matching is deterministic", () => { const inputs = admittedInputs(); assert.deepEqual(compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "EXACT_MATCH"), compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "EXACT_MATCH")); });

test("T6L-6J-F normalized matching is deterministic", () => { const inputs = admittedInputs(); assert.deepEqual(compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "NORMALIZED_MATCH"), compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "NORMALIZED_MATCH")); });

test("T6L-6J-F fuzzy matching is deterministic", () => { const inputs = admittedInputs(); assert.deepEqual(compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "FUZZY_CHAR_TRIGRAM_JACCARD"), compareCandidatesToProtectedFrozenBenchmark(inputs).findings.filter((item) => item.comparisonType === "FUZZY_CHAR_TRIGRAM_JACCARD")); });

test("T6L-6J-F benchmark text never appears in the result artifact", () => { const directory = temporaryDirectory(); try { const artifact: any = createMhsProtectedContaminationAudit(options(directory)).artifact; const serialized = JSON.stringify(artifact); assert.ok(artifact.rows.every((row: any) => !Object.prototype.hasOwnProperty.call(row, "text"))); assert.ok(artifact.findings.every((finding: any) => !["text", "excerpt", "tokens", "ngrams", "normalizedText"].some((key) => Object.prototype.hasOwnProperty.call(finding, key)))); assert.doesNotMatch(serialized, /benchmarkText|fixtureText|normalizedBenchmarkText/); } finally { clean(directory); } });

test("T6L-6J-F benchmark and candidate text never appear in logs or errors", () => { const sentinel = "PRIVATE_SENTINEL_MUST_NOT_ESCAPE"; const messages: string[] = []; const originalLog = console.log; const originalError = console.error; console.log = (...args: unknown[]) => { messages.push(args.join(" ")); }; console.error = (...args: unknown[]) => { messages.push(args.join(" ")); }; try { assert.throws(() => compareCandidatesToProtectedFrozenBenchmark([{ candidateRowId: "bad", candidateTextDigest: "0".repeat(64), text: sentinel }]), (error: Error) => !error.message.includes(sentinel)); assert.ok(messages.every((message) => !message.includes(sentinel))); } finally { console.log = originalLog; console.error = originalError; } });

test("T6L-6J-F opaque fixture references are sufficient for findings", () => { const first = admittedInputs()[0]; const finding: ProtectedDetectorFinding = { candidateRowId: first.candidateRowId, candidateTextDigest: first.candidateTextDigest, fixtureOpaqueId: `frozen_fixture_${"a".repeat(64)}`, fixtureFingerprint: "b".repeat(64), comparisonType: "EXACT_MATCH", matched: true, similarity: 1, threshold: 1, detectorVersion: PROTECTED_CONTAMINATION_DETECTOR_VERSION, disposition: "POTENTIAL_CONTAMINATION_REVIEW_REQUIRED" }; const directory = temporaryDirectory(); try { const artifact = createMhsProtectedContaminationAudit(options(directory, candidatePath, integrityPath, () => emptyResult(86, [finding]))).artifact; assert.equal(artifact.findings[0].fixtureOpaqueId, finding.fixtureOpaqueId); assert.ok(!Object.prototype.hasOwnProperty.call(artifact.findings[0], "text")); } finally { clean(directory); } });

test("T6L-6J-F candidate text remains unchanged", () => { const before = shaFile(candidatePath); const directory = temporaryDirectory(); try { createMhsProtectedContaminationAudit(options(directory)); assert.equal(shaFile(candidatePath), before); } finally { clean(directory); } });

test("T6L-6J-F candidate decisions remain unchanged", () => { const directory = temporaryDirectory(); try { const artifact = createMhsProtectedContaminationAudit(options(directory)).artifact; assert.deepEqual(artifact.rows.map((row) => row.reviewerDecision), candidate().rows.filter((row: any) => row.candidateAdmitted).map((row: any) => row.reviewerDecision)); } finally { clean(directory); } });

test("T6L-6J-F candidate membership remains unchanged", () => { const directory = temporaryDirectory(); try { const artifact = createMhsProtectedContaminationAudit(options(directory)).artifact; assert.deepEqual(artifact.rows.map((row) => row.candidateRowId), candidate().rows.filter((row: any) => row.candidateAdmitted).map((row: any) => row.sourceRowId)); } finally { clean(directory); } });

test("T6L-6J-F trainingEligible remains false", () => { const directory = temporaryDirectory(); try { assert.ok(createMhsProtectedContaminationAudit(options(directory)).artifact.rows.every((row) => row.trainingEligible === false)); } finally { clean(directory); } });

test("T6L-6J-F frozen fixtures are not copied into research outputs", () => { const research = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsProtectedContaminationAudit.ts"), "utf8"); assert.doesNotMatch(research, /textModerationFixtures|textModerationEvaluationFixtures/); const directory = temporaryDirectory(); try { const body = fs.readFileSync(createMhsProtectedContaminationAudit(options(directory)).artifactPath, "utf8"); assert.doesNotMatch(body, /"text"\s*:|"excerpt"\s*:|"tokens"\s*:|"ngrams"\s*:/); } finally { clean(directory); } });

test("T6L-6J-F contamination artifact refuses overwrite", () => { const directory = temporaryDirectory(); try { createMhsProtectedContaminationAudit(options(directory)); assert.throws(() => createMhsProtectedContaminationAudit(options(directory)), /already exists/); } finally { clean(directory); } });

test("T6L-6J-F partial publication leaves no authoritative artifact", () => { const directory = temporaryDirectory(); try { assert.throws(() => createMhsProtectedContaminationAudit({ ...options(directory), publishAtomic: () => { throw new Error("simulated publish failure"); } }), /simulated publish failure/); const output = path.join(directory, "candidates"); assert.equal(fs.existsSync(path.join(output, MHS_CONTAMINATION_AUDIT_FILENAME)), false); assert.deepEqual(fs.existsSync(output) ? fs.readdirSync(output) : [], []); } finally { clean(directory); } });

test("T6L-6J-F semantic evaluation downloads no model or dependency", () => { const files = ["src/research/textModerationDataset/mhsProtectedContaminationAudit.ts", "src/scripts/createMhsProtectedContaminationAudit.ts", "src/research/textModerationDataset/SEMANTIC_NEAR_DUPLICATE_TOOLING.md"]; const body = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(body, /child_process|execSync|spawnSync|npm install|curl |wget |hf_hub_download|snapshot_download/); });

test("T6L-6J-F semantic evaluation preserves moderation base-model authority", () => { const directory = temporaryDirectory(); try { const evaluation = createMhsProtectedContaminationAudit(options(directory)).artifact.semanticToolingEvaluation; assert.equal(evaluation.status, MHS_SEMANTIC_TOOLING_STATUS); assert.equal(evaluation.noModelDownloaded, true); assert.equal(evaluation.moderationBaseModelUnchanged, "FacebookAI/xlm-roberta-base"); } finally { clean(directory); } });

test("T6L-6J-F upstream parent and review artifacts remain byte-identical", () => { const paths = [parentPath, reviewerPath, resolutionPath, candidatePath, integrityPath]; const before = paths.map(shaFile); const directory = temporaryDirectory(); try { createMhsProtectedContaminationAudit(options(directory)); assert.deepEqual(paths.map(shaFile), before); } finally { clean(directory); } });
