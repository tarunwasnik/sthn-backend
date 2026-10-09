import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import { E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD } from "../../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_BOUNDARY_COLUMNS, MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST, MhsSemanticBoundaryManifest,
  parseCompletedMhsSemanticBoundaryCsv,
} from "../../research/textModerationDataset/mhsSemanticBoundaryReviewPacket";
import {
  MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME, MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME,
  MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME,
  MHS_SEMANTIC_COMBINED_THRESHOLDS, createMhsSemanticBoundaryAnalysis,
  createMhsSemanticBoundaryValidatedReview, validateMhsSemanticBoundaryAnalysisArtifact,
  validateMhsSemanticBoundaryValidatedArtifact, verifyMhsSemanticBoundaryValidationAuthorities,
} from "../../research/textModerationDataset/mhsSemanticBoundaryReviewValidation";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const review = path.join(root, "semantic-review");
const completedPath = path.join(review, MHS_SEMANTIC_BOUNDARY_COMPLETED_FILENAME);
const manifestPath = path.join(review, "mhs-semantic-boundary-review-v1-internal-manifest.json");
const blindedPath = path.join(review, "mhs-semantic-boundary-review-v1-blinded.csv");
const hValidatedPath = path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json");
const hPrecisionPath = path.join(review, "mhs-semantic-review-v1-precision-analysis.json");
const candidatePath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json");
const semanticPath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1-semantic-audit.json");
const fixedAt = "2026-09-13T12:00:00.000Z";
const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-boundary-k-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const manifest = (): MhsSemanticBoundaryManifest => JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MhsSemanticBoundaryManifest;
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const toCsv = (records: readonly CsvRecord[]): string => `${MHS_SEMANTIC_BOUNDARY_COLUMNS.map(csvCell).join(",")}\r\n${records.map((row) => MHS_SEMANTIC_BOUNDARY_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
const changedCsv = (directory: string, change: (rows: Record<string, string>[]) => void): string => { const rows = parseCsv(fs.readFileSync(completedPath, "utf8")).map((row) => ({ ...row })); change(rows); const filename = path.join(directory, "changed.csv"); fs.writeFileSync(filename, toCsv(rows)); return filename; };
const validatedOptions = (outputDirectory: string) => ({ completedCsvPath: completedPath, manifestPath, blindedPacketPath: blindedPath, outputDirectory, importedAt: fixedAt });
const createBoth = (directory: string) => { const validated = createMhsSemanticBoundaryValidatedReview(validatedOptions(path.join(directory, "validated"))); const analysis = createMhsSemanticBoundaryAnalysis({
  validatedBoundaryArtifactPath: validated.artifactPath, hValidatedArtifactPath: hValidatedPath, hPrecisionArtifactPath: hPrecisionPath, outputDirectory: path.join(directory, "analysis"), generatedAt: fixedAt,
}); return { validated, analysis }; };

test("K validates the authoritative completed J CSV", () => assert.equal(crypto.createHash("sha256").update(fs.readFileSync(completedPath)).digest("hex"), MHS_SEMANTIC_BOUNDARY_COMPLETED_SHA256));
test("K parses exactly 75 completed J rows", () => assert.equal(parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(completedPath, "utf8"), manifest(), "a").length, 75));
test("K enforces J membership and order", () => { const directory = temporary(); try { const csv = changedCsv(directory, (rows) => { [rows[0], rows[1]] = [rows[1], rows[0]]; }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /row number|membership|order/i); } finally { clean(directory); } });
test("K preserves zero H/J overlap", () => { const directory = temporary(); try { assert.equal(createBoth(directory).validated.artifact.hJOverlapCount, 0); } finally { clean(directory); } });
test("K rejects candidate text and digest edits", () => { const directory = temporary(); try { for (const column of ["candidate_a_text", "candidate_a_digest"] as const) { const csv = changedCsv(directory, (rows) => { rows[0][column] += "x"; }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /text changed|digest changed/); } } finally { clean(directory); } });
test("K requires reviewer ID a", () => { const directory = temporary(); try { const csv = changedCsv(directory, (rows) => { rows[0].reviewer_id_input = "b"; }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /identity mismatch/); } finally { clean(directory); } });
test("K enforces strict UTC millisecond timestamps", () => { const directory = temporary(); try { const csv = changedCsv(directory, (rows) => { rows[0].reviewed_at_input = "2026-09-13T00:01:09Z"; }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /timestamp/); } finally { clean(directory); } });
test("K enforces the relationship enum", () => { const directory = temporary(); try { const csv = changedCsv(directory, (rows) => { rows[0].semantic_relationship_input = "related_but_distinct"; }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /relationship/); } finally { clean(directory); } });
test("K bounds reviewer notes", () => { const directory = temporary(); try { const csv = changedCsv(directory, (rows) => { rows[0].reviewer_note_input = "x".repeat(501); }); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(csv, "utf8"), manifest(), "a"), /500/); } finally { clean(directory); } });
test("K preserves human judgments and notes exactly", () => { const directory = temporary(); try { const source = parseCompletedMhsSemanticBoundaryCsv(fs.readFileSync(completedPath, "utf8"), manifest(), "a"); const result = createBoth(directory).validated.artifact.records; assert.deepEqual(result.map((row) => [row.semanticRelationship, row.reviewerNote]), source.map((row) => [row.relationship, row.reviewerNote])); } finally { clean(directory); } });
test("K validated J artifact is canonical and deterministic", () => { const a = temporary(); const b = temporary(); try { const one = createBoth(a).validated; const two = createBoth(b).validated; assert.equal(fs.readFileSync(one.artifactPath, "utf8"), fs.readFileSync(two.artifactPath, "utf8")); assert.doesNotThrow(() => validateMhsSemanticBoundaryValidatedArtifact(one.artifact)); } finally { clean(a); clean(b); } });
test("K J outcome counts are exact", () => { const directory = temporary(); try { assert.deepEqual(createBoth(directory).analysis.artifact.jHumanOutcomeCounts, { DUPLICATE: 0, NEAR_DUPLICATE: 0, RELATED_BUT_DISTINCT: 28, UNRELATED: 47, NEEDS_ADJUDICATION: 0 }); } finally { clean(directory); } });
test("K J score-stratum calculations are deterministic", () => { const a = temporary(); const b = temporary(); try { const one = createBoth(a).analysis.artifact.jStratumYield; const two = createBoth(b).analysis.artifact.jStratumYield; assert.deepEqual(one, two); assert.equal(Object.values(one).reduce((sum, row) => sum + row.pairCount, 0), 75); } finally { clean(a); clean(b); } });
test("K pair-type calculations are deterministic", () => { const a = temporary(); const b = temporary(); try { const one = createBoth(a).analysis.artifact.jPairTypeAnalysis; assert.deepEqual(one, createBoth(b).analysis.artifact.jPairTypeAnalysis); assert.equal(Object.values(one).reduce((sum, row) => sum + row.pairCount, 0), 75); } finally { clean(a); clean(b); } });
test("K combined H/J calculations are deterministic and disjoint", () => { const a = temporary(); const b = temporary(); try { const one = createBoth(a).analysis.artifact; const two = createBoth(b).analysis.artifact; assert.deepEqual(one.combinedHumanOutcomeCounts, two.combinedHumanOutcomeCounts); assert.deepEqual(one.combinedHumanOutcomeCounts, { DUPLICATE: 0, NEAR_DUPLICATE: 2, RELATED_BUT_DISTINCT: 61, UNRELATED: 162, NEEDS_ADJUDICATION: 0 }); assert.equal(one.combinedRowCount, 225); } finally { clean(a); clean(b); } });
test("K threshold evidence is deterministic and reviewed-membership scoped", () => { const a = temporary(); const b = temporary(); try { const one = createBoth(a).analysis.artifact.thresholdEvidence; assert.deepEqual(one, createBoth(b).analysis.artifact.thresholdEvidence); assert.deepEqual(one.map((row) => row.threshold), [...MHS_SEMANTIC_COMBINED_THRESHOLDS]); assert.equal(one[0].retainedCount, 225); assert.equal(one[5].duplicateLikeRecallWithinReviewedMembership, 1); } finally { clean(a); clean(b); } });
test("K leaves candidate and semantic authorities byte-identical", () => { const before = [fs.readFileSync(candidatePath), fs.readFileSync(semanticPath)]; const directory = temporary(); try { createBoth(directory); verifyMhsSemanticBoundaryValidationAuthorities(candidatePath, semanticPath); assert.ok(before[0].equals(fs.readFileSync(candidatePath))); assert.ok(before[1].equals(fs.readFileSync(semanticPath))); } finally { clean(directory); } });
test("K preserves candidate membership and moderation judgments", () => { const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; const rows = candidate.rows.filter((row) => row.candidateAdmitted); assert.equal(rows.length, 86); assert.equal(rows.filter((row) => row.reviewerDecision === "ALLOW").length, 58); assert.equal(rows.filter((row) => row.reviewerDecision === "BLOCK").length, 28); });
test("K preserves semantic thresholds", () => { assert.equal(E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD, 0.8); assert.equal(E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, 0.94); });
test("K keeps training eligibility at zero", () => { const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; assert.equal(candidate.rows.filter((row) => row.trainingEligible).length, 0); });
test("K accesses neither frozen benchmark nor another reviewer", () => { const files = ["src/research/textModerationDataset/mhsSemanticBoundaryReviewValidation.ts", "src/scripts/createMhsSemanticBoundaryReviewValidation.ts"]; const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|reviewer[_ ]?b|second reviewer/i); });
test("K validated artifact refuses overwrite", () => { const directory = temporary(); try { createMhsSemanticBoundaryValidatedReview(validatedOptions(directory)); assert.throws(() => createMhsSemanticBoundaryValidatedReview(validatedOptions(directory)), /already exists/); } finally { clean(directory); } });
test("K analysis artifact validates and refuses overwrite", () => { const directory = temporary(); try { const { validated, analysis } = createBoth(directory); assert.doesNotThrow(() => validateMhsSemanticBoundaryAnalysisArtifact(analysis.artifact)); assert.throws(() => createMhsSemanticBoundaryAnalysis({ validatedBoundaryArtifactPath: validated.artifactPath, hValidatedArtifactPath: hValidatedPath, hPrecisionArtifactPath: hPrecisionPath, outputDirectory: path.dirname(analysis.artifactPath), generatedAt: fixedAt }), /already exists/); } finally { clean(directory); } });
test("K simulated partial publication leaves no authoritative artifact", () => { const directory = temporary(); try { const validatedOutput = path.join(directory, "validated"); assert.throws(() => createMhsSemanticBoundaryValidatedReview({ ...validatedOptions(validatedOutput), publishAtomic: () => { throw new Error("simulated"); } }), /simulated/); assert.equal(fs.existsSync(path.join(validatedOutput, MHS_SEMANTIC_BOUNDARY_VALIDATED_FILENAME)), false); const validated = createMhsSemanticBoundaryValidatedReview(validatedOptions(path.join(directory, "source"))); const analysisOutput = path.join(directory, "analysis"); assert.throws(() => createMhsSemanticBoundaryAnalysis({ validatedBoundaryArtifactPath: validated.artifactPath, hValidatedArtifactPath: hValidatedPath, hPrecisionArtifactPath: hPrecisionPath, outputDirectory: analysisOutput, generatedAt: fixedAt, publishAtomic: () => { throw new Error("simulated"); } }), /simulated/); assert.equal(fs.existsSync(path.join(analysisOutput, MHS_SEMANTIC_BOUNDARY_ANALYSIS_FILENAME)), false); } finally { clean(directory); } });
test("K artifact membership authority remains frozen", () => { const directory = temporary(); try { assert.equal(createBoth(directory).validated.artifact.packetMembershipDigest, MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST); } finally { clean(directory); } });
