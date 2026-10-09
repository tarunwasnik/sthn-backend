import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import { E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD } from "../../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_BOUNDARY_COLUMNS, MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST,
  MHS_SEMANTIC_BOUNDARY_PACKET_SIZE, MHS_SEMANTIC_BOUNDARY_PAIR_TYPES, MHS_SEMANTIC_BOUNDARY_REUSE_CAP,
  MHS_SEMANTIC_BOUNDARY_STRATA, createMhsSemanticBoundaryCsv, createMhsSemanticBoundaryManifest,
  loadMhsSemanticBoundarySources, mhsSemanticBoundaryMembershipDigest, parseCompletedMhsSemanticBoundaryCsv,
  selectMhsSemanticBoundaryPairs, summarizeMhsSemanticBoundaryPacket, validatePreparedMhsSemanticBoundaryCsv,
} from "../../research/textModerationDataset/mhsSemanticBoundaryReviewPacket";
import { MHS_SEMANTIC_RELATIONSHIP_OUTCOMES } from "../../research/textModerationDataset/mhsSemanticReviewPacket";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, "semantic-review");
const paths = { semanticPath: path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1-semantic-audit.json"), candidatePath: path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json"),
  hManifestPath: path.join(review, "mhs-semantic-review-v1-internal-manifest.json"), iValidatedPath: path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json"),
  iPrecisionPath: path.join(review, "mhs-semantic-review-v1-precision-analysis.json") };
const packet = () => { const sources = loadMhsSemanticBoundarySources(paths); const rows = selectMhsSemanticBoundaryPairs(sources); const manifest = createMhsSemanticBoundaryManifest(rows, sources.hManifest); return { sources, rows, manifest, csv: createMhsSemanticBoundaryCsv(rows) }; };
const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-boundary-j-")); const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`; const toCsv = (records: readonly CsvRecord[]): string => `${MHS_SEMANTIC_BOUNDARY_COLUMNS.map(csvCell).join(",")}\r\n${records.map((row) => MHS_SEMANTIC_BOUNDARY_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
const mutate = (csv: string, change: (rows: Record<string, string>[]) => void): string => { const rows = parseCsv(csv).map((row) => ({ ...row })); change(rows); return toCsv(rows); };
const completed = (csv: string, timestamp = "2026-09-13T10:00:00.000Z"): string => mutate(csv, (rows) => rows.forEach((row) => { row.semantic_relationship_input = "UNRELATED"; row.reviewer_id_input = "a"; row.reviewed_at_input = timestamp; }));

test("J enforces semantic and H/I source authorities", () => assert.doesNotThrow(() => loadMhsSemanticBoundarySources(paths)));
test("J rejects a changed semantic source SHA", () => { const directory = temporary(); try { const changed = path.join(directory, "semantic.json"); fs.writeFileSync(changed, `${fs.readFileSync(paths.semanticPath, "utf8")} `);
  assert.throws(() => loadMhsSemanticBoundarySources({ ...paths, semanticPath: changed }), /SHA-256/); } finally { clean(directory); } });
test("J rejects a changed H membership authority", () => { const directory = temporary(); try { const changed = path.join(directory, "manifest.json"); fs.writeFileSync(changed, `${fs.readFileSync(paths.hManifestPath, "utf8")} `);
  assert.throws(() => loadMhsSemanticBoundarySources({ ...paths, hManifestPath: changed }), /SHA-256/); } finally { clean(directory); } });
test("J has zero overlap with every H reviewed unordered pair", () => { const value = packet(); const h = new Set(value.sources.hManifest.rows.map((row) => row.pairKey)); assert.equal(value.rows.filter((row) => h.has(row.pairKey)).length, 0); assert.equal(value.manifest.hOverlapCount, 0); });
test("J every pair was previously unreviewed", () => { const value = packet(); const reviewed = new Set(value.sources.hManifest.rows.map((row) => row.pairKey)); assert.ok(value.rows.every((row) => !reviewed.has(row.pairKey))); });
test("J every pair is below 0.85 and inside the authorized boundary", () => assert.ok(packet().rows.every((row) => row.semanticScore >= 0.82 && row.semanticScore < 0.85)));
test("J boundary strata are deterministic with documented availability reallocation", () => { const summary = summarizeMhsSemanticBoundaryPacket(packet().manifest, packet().csv); assert.deepEqual(summary.scoreStratumCounts,
  { SCORE_082_TO_083: 15, SCORE_083_TO_084: 27, SCORE_084_TO_085: 33 }); assert.ok(MHS_SEMANTIC_BOUNDARY_STRATA.every((stratum) => (summary.scoreStratumCounts as Record<string, number>)[stratum] > 0)); });
test("J membership is deterministic and frozen", () => { const a = packet(); const b = packet(); assert.deepEqual(a.rows, b.rows); assert.equal(a.manifest.membershipDigest, MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST); assert.equal(mhsSemanticBoundaryMembershipDigest(b.rows), MHS_SEMANTIC_BOUNDARY_MEMBERSHIP_DIGEST); });
test("J contains 75 unique unordered pairs", () => { const rows = packet().rows; assert.equal(rows.length, MHS_SEMANTIC_BOUNDARY_PACKET_SIZE); assert.equal(new Set(rows.map((row) => row.pairKey)).size, 75); });
test("J represents all four pair types without equal-quota distortion", () => { const counts = summarizeMhsSemanticBoundaryPacket(packet().manifest, packet().csv).pairTypeCounts as Record<string, number>;
  assert.deepEqual(counts, { ALLOW_ALLOW: 17, ALLOW_BLOCK: 30, BLOCK_BLOCK_DIFFERENT_PRIMARY_CATEGORY: 18, BLOCK_BLOCK_SAME_PRIMARY_CATEGORY: 10 }); assert.ok(MHS_SEMANTIC_BOUNDARY_PAIR_TYPES.every((type) => counts[type] > 0)); });
test("J candidate reuse remains bounded and reported", () => { const reuse = summarizeMhsSemanticBoundaryPacket(packet().manifest, packet().csv).candidateReuse as { maximum: number; cap: number; representedCandidates: number };
  assert.equal(reuse.cap, MHS_SEMANTIC_BOUNDARY_REUSE_CAP); assert.equal(reuse.maximum, 8); assert.equal(reuse.representedCandidates, 56); });
test("J blinded packet excludes score, moderation, category, and source-label fields", () => { const header = Object.keys(parseCsv(packet().csv)[0]); assert.deepEqual(header, [...MHS_SEMANTIC_BOUNDARY_COLUMNS]); assert.doesNotMatch(header.join(" "), /score|decision|category|hate|mhs|expected|previous/i); });
test("J reviewer inputs are blank at preparation", () => assert.doesNotThrow(() => validatePreparedMhsSemanticBoundaryCsv(packet().csv, packet().manifest)));
test("J instructions enforce meaning-first review", () => { assert.match(MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, /Judge meaning/); assert.match(MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, /Shared abusive words do not make texts related/); assert.match(MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, /same moderation category does not make texts related/i); });
test("J completed validator accepts only the existing enum and stable reviewer", () => { const value = packet(); const parsed = parseCompletedMhsSemanticBoundaryCsv(completed(value.csv), value.manifest, "a"); assert.equal(parsed.length, 75); assert.ok(parsed.every((row) => MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.includes(row.relationship)));
  assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(mutate(completed(value.csv), (rows) => { rows[0].semantic_relationship_input = "ALLOW"; }), value.manifest, "a"), /relationship/);
  assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(mutate(completed(value.csv), (rows) => { rows[0].reviewer_id_input = "b"; }), value.manifest, "a"), /identity/);
  assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(mutate(completed(value.csv), (rows) => rows.forEach((row) => { row.reviewer_id_input = "b"; })), value.manifest, "b"), /must be a/); });
test("J validator enforces immutable text, identity, and strict millisecond timestamp", () => { const value = packet(); assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(mutate(completed(value.csv), (rows) => { rows[0].candidate_a_text += "x"; }), value.manifest, "a"), /text changed/);
  assert.throws(() => parseCompletedMhsSemanticBoundaryCsv(completed(value.csv, "2026-09-13T10:00:00Z"), value.manifest, "a"), /timestamp/); });
test("J leaves candidate membership and moderation judgments unchanged", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; const admitted = candidate.rows.filter((row) => row.candidateAdmitted);
  assert.equal(admitted.length, 86); assert.equal(admitted.filter((row) => row.reviewerDecision === "ALLOW").length, 58); assert.equal(admitted.filter((row) => row.reviewerDecision === "BLOCK").length, 28); assert.ok(candidate.rows.every((row) => row.trainingEligible === false)); });
test("J leaves semantic thresholds and source artifact unchanged", () => { assert.equal(E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD, 0.8); assert.equal(E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, 0.94); assert.equal(packet().sources.semantic.trainingEligibleCount, 0); });
test("J tooling never accesses the frozen benchmark or introduces another reviewer", () => { const files = ["src/research/textModerationDataset/mhsSemanticBoundaryReviewPacket.ts", "src/scripts/prepareMhsSemanticBoundaryReviewPacket.ts"];
  const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|reviewer[_ ]?b|second reviewer/i); });
test("J output generation is byte-deterministic", () => { const a = packet(); const b = packet(); assert.equal(a.csv, b.csv); assert.equal(JSON.stringify(a.manifest), JSON.stringify(b.manifest)); });
