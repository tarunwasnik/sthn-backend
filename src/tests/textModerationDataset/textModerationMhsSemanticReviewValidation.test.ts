import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MHS_SEMANTIC_REVIEW_COLUMNS, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST, MhsSemanticReviewManifest, parseCompletedMhsSemanticReviewCsv } from "../../research/textModerationDataset/mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME, MHS_SEMANTIC_COMPLETED_REVIEW_SHA256, MHS_SEMANTIC_PRECISION_FILENAME,
  MHS_SEMANTIC_REVIEWER_ID, MHS_SEMANTIC_THRESHOLD_CANDIDATES, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME,
  createMhsSemanticPrecisionAnalysis, createMhsSemanticValidatedReview, validateMhsSemanticPrecisionArtifact,
  validateMhsSemanticValidatedReviewArtifact, verifyMhsSemanticValidationBoundaries,
} from "../../research/textModerationDataset/mhsSemanticReviewValidation";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, "semantic-review");
const completedPath = path.join(review, MHS_SEMANTIC_COMPLETED_REVIEW_FILENAME); const manifestPath = path.join(review, "mhs-semantic-review-v1-internal-manifest.json");
const blindedPath = path.join(review, "mhs-semantic-review-v1-blinded.csv"); const candidatePath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json");
const semanticPath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1-semantic-audit.json");
const fixedAt = "2026-09-12T12:00:00.000Z"; const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-semantic-i-")); const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const validationOptions = (outputDirectory: string, csvPath = completedPath) => ({ completedCsvPath: csvPath, manifestPath, blindedPacketPath: blindedPath, outputDirectory, importedAt: fixedAt });
const manifest = (): MhsSemanticReviewManifest => JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MhsSemanticReviewManifest;
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const toCsv = (records: readonly CsvRecord[]): string => `${MHS_SEMANTIC_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${records.map((row) => MHS_SEMANTIC_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
const changedCsv = (directory: string, change: (rows: Record<string, string>[]) => void): string => { const rows = parseCsv(fs.readFileSync(completedPath, "utf8")).map((row) => ({ ...row })); change(rows); const filename = path.join(directory, "changed.csv"); fs.writeFileSync(filename, toCsv(rows)); return filename; };
const createBoth = (directory: string) => { const validated = createMhsSemanticValidatedReview(validationOptions(path.join(directory, "validated")));
  const precision = createMhsSemanticPrecisionAnalysis({ validatedReviewArtifactPath: validated.artifactPath, outputDirectory: path.join(directory, "precision"), generatedAt: fixedAt }); return { validated, precision }; };

test("I validates the exact corrected completed packet and parses 150 rows", () => { assert.equal(shaFile(completedPath), MHS_SEMANTIC_COMPLETED_REVIEW_SHA256);
  const rows = parseCompletedMhsSemanticReviewCsv(fs.readFileSync(completedPath, "utf8"), manifest(), MHS_SEMANTIC_REVIEWER_ID); assert.equal(rows.length, 150); });
test("I enforces completed packet membership and order", () => { const directory = temporary(); try { const changed = changedCsv(directory, (rows) => { [rows[0], rows[1]] = [rows[1], rows[0]]; });
  assert.throws(() => createMhsSemanticValidatedReview(validationOptions(directory, changed)), /SHA-256 mismatch/); } finally { clean(directory); } });
test("I H-authority rejects candidate text and digest edits", () => { const directory = temporary(); try { for (const field of ["candidate_a_text", "candidate_a_digest"] as const) {
  const changed = changedCsv(directory, (rows) => { rows[0][field] += "x"; }); assert.throws(() => parseCompletedMhsSemanticReviewCsv(fs.readFileSync(changed, "utf8"), manifest(), "a"), /text changed|digest changed/); } } finally { clean(directory); } });
test("I requires one reviewer ID exactly equal to a", () => { const directory = temporary(); try { const changed = changedCsv(directory, (rows) => { rows[149].reviewer_id_input = "b"; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(fs.readFileSync(changed, "utf8"), manifest(), "a"), /identity mismatch/); } finally { clean(directory); } });
test("I enforces strict UTC millisecond timestamps", () => { const directory = temporary(); try { const changed = changedCsv(directory, (rows) => { rows[0].reviewed_at_input = "2026-09-12T10:55:12Z"; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(fs.readFileSync(changed, "utf8"), manifest(), "a"), /timestamp/); } finally { clean(directory); } });
test("I enforces the relationship enum without normalization", () => { const directory = temporary(); try { const changed = changedCsv(directory, (rows) => { rows[0].semantic_relationship_input = "near_duplicate"; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(fs.readFileSync(changed, "utf8"), manifest(), "a"), /relationship/); } finally { clean(directory); } });
test("I bounds notes at 500 characters", () => { const directory = temporary(); try { const changed = changedCsv(directory, (rows) => { rows[0].reviewer_note_input = "x".repeat(501); });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(fs.readFileSync(changed, "utf8"), manifest(), "a"), /500/); } finally { clean(directory); } });
test("I preserves all human decisions exactly", () => { const directory = temporary(); try { const result = createMhsSemanticValidatedReview(validationOptions(directory));
  const source = parseCompletedMhsSemanticReviewCsv(fs.readFileSync(completedPath, "utf8"), manifest(), "a"); assert.deepEqual(result.artifact.records.map((row) => row.semanticRelationship), source.map((row) => row.relationship));
  assert.deepEqual(result.artifact.records.map((row) => row.reviewerNote), source.map((row) => row.reviewerNote)); } finally { clean(directory); } });
test("I validated artifacts are canonical and deterministic for fixed authority metadata", () => { const one = temporary(); const two = temporary(); try { const a = createMhsSemanticValidatedReview(validationOptions(one)); const b = createMhsSemanticValidatedReview(validationOptions(two));
  assert.equal(fs.readFileSync(a.artifactPath, "utf8"), fs.readFileSync(b.artifactPath, "utf8")); assert.doesNotThrow(() => validateMhsSemanticValidatedReviewArtifact(a.artifact)); } finally { clean(one); clean(two); } });
test("I outcome counts are exact and deterministic", () => { const directory = temporary(); try { assert.deepEqual(createMhsSemanticValidatedReview(validationOptions(directory)).artifact.humanOutcomeCounts,
  { DUPLICATE: 0, NEAR_DUPLICATE: 2, RELATED_BUT_DISTINCT: 33, UNRELATED: 115, NEEDS_ADJUDICATION: 0 }); } finally { clean(directory); } });
test("I score-band and pair-type calculations are deterministic", () => { const one = temporary(); const two = temporary(); try { const a = createBoth(one).precision.artifact; const b = createBoth(two).precision.artifact;
  assert.deepEqual(a.scoreBandPrecision, b.scoreBandPrecision); assert.deepEqual(a.decisionRelationshipPrecision, b.decisionRelationshipPrecision);
  assert.equal(Object.values(a.scoreBandPrecision).reduce((sum, row) => sum + row.sampleCount, 0), 150); assert.equal(Object.values(a.decisionRelationshipPrecision).reduce((sum, row) => sum + row.sampleCount, 0), 150); } finally { clean(one); clean(two); } });
test("I primary-category analysis is distinct from full classification-set strata", () => { const directory = temporary(); try { const analysis = createBoth(directory).precision.artifact.categoryPairAnalysis;
  assert.equal(analysis.samePrimaryCategory.sampleCount + analysis.differentPrimaryCategory.sampleCount, 60);
  assert.equal(analysis.samePrimaryCategory.outcomeCounts.NEAR_DUPLICATE, 2); assert.equal(analysis.differentPrimaryCategory.outcomeCounts.NEAR_DUPLICATE, 0); } finally { clean(directory); } });
test("I threshold analysis is deterministic and packet-scoped", () => { const directory = temporary(); try { const artifact = createBoth(directory).precision.artifact;
  assert.deepEqual(artifact.thresholdEvaluation.map((row) => row.threshold), [...MHS_SEMANTIC_THRESHOLD_CANDIDATES]); assert.equal(artifact.thresholdEvaluation[0].retainedCount, 150);
  assert.equal(artifact.thresholdEvaluation[0].duplicateLikeRecallWithinPacket, 1); assert.equal(artifact.thresholdEvaluation[5].duplicateLikeRecallWithinPacket, 1); } finally { clean(directory); } });
test("I leaves candidate and semantic artifacts byte-identical", () => { const before = [shaFile(candidatePath), shaFile(semanticPath)]; const directory = temporary(); try { createBoth(directory);
  verifyMhsSemanticValidationBoundaries(candidatePath, semanticPath); assert.deepEqual([shaFile(candidatePath), shaFile(semanticPath)], before); } finally { clean(directory); } });
test("I preserves 86-member candidate authority and zero training eligibility", () => { const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact;
  assert.equal(shaFile(candidatePath), MHS_CANDIDATE_ARTIFACT_SHA256); assert.equal(candidate.rows.filter((row) => row.candidateAdmitted).length, 86); assert.equal(candidate.rows.some((row) => row.trainingEligible), false);
  assert.equal(manifest().membershipDigest, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST); });
test("I code has no frozen benchmark access or second-review authority", () => { const files = ["src/research/textModerationDataset/mhsSemanticReviewValidation.ts", "src/scripts/createMhsSemanticReviewValidation.ts"];
  const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|reviewer[_ ]?b|second reviewer/i); });
test("I validated artifact refuses overwrite", () => { const directory = temporary(); try { createMhsSemanticValidatedReview(validationOptions(directory));
  assert.throws(() => createMhsSemanticValidatedReview(validationOptions(directory)), /already exists/); } finally { clean(directory); } });
test("I precision artifact validates and refuses overwrite", () => { const directory = temporary(); try { const { validated, precision } = createBoth(directory); assert.doesNotThrow(() => validateMhsSemanticPrecisionArtifact(precision.artifact));
  assert.throws(() => createMhsSemanticPrecisionAnalysis({ validatedReviewArtifactPath: validated.artifactPath, outputDirectory: path.dirname(precision.artifactPath), generatedAt: fixedAt }), /already exists/); } finally { clean(directory); } });
test("I failed atomic validation publication leaves no authoritative artifact", () => { const directory = temporary(); try { assert.throws(() => createMhsSemanticValidatedReview({ ...validationOptions(directory), publishAtomic: () => { throw new Error("simulated publication failure"); } }), /simulated/);
  assert.equal(fs.existsSync(path.join(directory, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME)), false); assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []); } finally { clean(directory); } });
test("I failed atomic precision publication leaves no precision artifact", () => { const directory = temporary(); try { const validated = createMhsSemanticValidatedReview(validationOptions(path.join(directory, "validated")));
  const output = path.join(directory, "precision"); assert.throws(() => createMhsSemanticPrecisionAnalysis({ validatedReviewArtifactPath: validated.artifactPath, outputDirectory: output, generatedAt: fixedAt, publishAtomic: () => { throw new Error("simulated publication failure"); } }), /simulated/);
  assert.equal(fs.existsSync(path.join(output, MHS_SEMANTIC_PRECISION_FILENAME)), false); assert.deepEqual(fs.existsSync(output) ? fs.readdirSync(output) : [], []); } finally { clean(directory); } });
