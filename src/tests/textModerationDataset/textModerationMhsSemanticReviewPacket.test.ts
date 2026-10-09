import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST } from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import { MhsSemanticAuditArtifact } from "../../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_DECISION_RELATIONSHIPS, MHS_SEMANTIC_RELATIONSHIP_OUTCOMES, MHS_SEMANTIC_REVIEW_COLUMNS,
  MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST, MHS_SEMANTIC_REVIEW_PACKET_SIZE, MHS_SEMANTIC_REVIEW_REUSE_CAP,
  MHS_SEMANTIC_SCORE_BANDS, MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST, MHS_SEMANTIC_SOURCE_SHA256,
  createMhsSemanticReviewCsv, createMhsSemanticReviewManifest, loadMhsSemanticReviewSources,
  mhsSemanticReviewMembershipDigest, parseCompletedMhsSemanticReviewCsv, selectMhsSemanticReviewPairs,
  summarizeMhsSemanticReviewPacket, validatePreparedMhsSemanticReviewCsv,
} from "../../research/textModerationDataset/mhsSemanticReviewPacket";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const candidatePath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json");
const semanticPath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1-semantic-audit.json");
const candidate = (): MhsCandidateAdmissionArtifact => JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact;
const semantic = (): MhsSemanticAuditArtifact => JSON.parse(fs.readFileSync(semanticPath, "utf8")) as MhsSemanticAuditArtifact;
const packet = () => { const rows = selectMhsSemanticReviewPairs(semantic(), candidate()); const manifest = createMhsSemanticReviewManifest(rows); return { rows, manifest, csv: createMhsSemanticReviewCsv(rows) }; };
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const toCsv = (records: readonly CsvRecord[]): string => `${MHS_SEMANTIC_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${records.map((row) => MHS_SEMANTIC_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
const mutateCsv = (csv: string, change: (records: Record<string, string>[]) => void): string => { const records = parseCsv(csv).map((row) => ({ ...row })); change(records); return toCsv(records); };
const completeCsv = (csv: string, relationship = "DUPLICATE"): string => mutateCsv(csv, (records) => records.forEach((row) => {
  row.semantic_relationship_input = relationship; row.reviewer_id_input = "semantic_reviewer_01"; row.reviewed_at_input = "2026-09-11T10:00:00.000Z";
}));
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

test("H binds the exact semantic source SHA and payload digest", () => {
  assert.equal(shaFile(semanticPath), MHS_SEMANTIC_SOURCE_SHA256); assert.equal(semantic().semanticAuditPayloadDigest, MHS_SEMANTIC_SOURCE_PAYLOAD_DIGEST);
  assert.doesNotThrow(() => loadMhsSemanticReviewSources(semanticPath, candidatePath));
});
test("H rejects a changed semantic source SHA", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-h-sha-")); const changed = path.join(directory, "semantic.json");
  try { fs.writeFileSync(changed, `${fs.readFileSync(semanticPath, "utf8")} `); assert.throws(() => loadMhsSemanticReviewSources(changed, candidatePath), /SHA-256/); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("H rejects a changed semantic payload digest even under an injected artifact object", () => { const altered = { ...semantic(), semanticAuditPayloadDigest: "0".repeat(64) } as MhsSemanticAuditArtifact;
  assert.throws(() => selectMhsSemanticReviewPairs(altered, candidate()), /payload|summary/i); });
test("H selects deterministic frozen 150-pair membership", () => { const first = packet(); const second = packet(); assert.equal(first.rows.length, MHS_SEMANTIC_REVIEW_PACKET_SIZE);
  assert.equal(first.manifest.membershipDigest, MHS_SEMANTIC_REVIEW_MEMBERSHIP_DIGEST); assert.equal(mhsSemanticReviewMembershipDigest(second.rows), first.manifest.membershipDigest); assert.deepEqual(second.rows, first.rows); });
test("H contains no duplicate unordered pairs", () => { const { rows } = packet(); assert.equal(new Set(rows.map((row) => [row.candidateAId, row.candidateBId].sort().join("::"))).size, 150); });
test("H draws every pair from a flagged semantic finding", () => { const source = new Map(semantic().findings.map((finding) => [`${finding.candidateAId}::${finding.candidateBId}`, finding]));
  assert.ok(packet().rows.every((row) => source.has(row.pairKey) && row.semanticScore >= 0.8)); });
test("H represents all four score strata with frozen counts", () => { const counts = summarizeMhsSemanticReviewPacket(packet().manifest, packet().csv).scoreBandCounts as Record<string, number>;
  assert.deepEqual(counts, { SCORE_080_TO_081: 48, SCORE_081_TO_083: 48, SCORE_083_TO_085: 35, SCORE_085_PLUS: 19 }); assert.ok(MHS_SEMANTIC_SCORE_BANDS.every((band) => counts[band] > 0)); });
test("H represents every decision relationship", () => { const counts = summarizeMhsSemanticReviewPacket(packet().manifest, packet().csv).decisionRelationshipCounts as Record<string, number>;
  assert.deepEqual(counts, { ALLOW_ALLOW: 45, ALLOW_BLOCK: 45, BLOCK_BLOCK_DIFFERENT_CATEGORY: 30, BLOCK_BLOCK_SAME_CATEGORY: 30 }); assert.ok(MHS_SEMANTIC_DECISION_RELATIONSHIPS.every((value) => counts[value] > 0)); });
test("H reports bounded candidate reuse", () => { const reuse = summarizeMhsSemanticReviewPacket(packet().manifest, packet().csv).candidateReuse as { maximum: number; cap: number };
  assert.equal(reuse.cap, MHS_SEMANTIC_REVIEW_REUSE_CAP); assert.ok(reuse.maximum <= MHS_SEMANTIC_REVIEW_REUSE_CAP); });
test("H blinded CSV excludes policy and source-label fields", () => { const { csv } = packet(); const header = Object.keys(parseCsv(csv)[0]);
  for (const hidden of ["semantic_score", "existing_decision_relationship", "candidate_a_decision", "candidate_b_decision", "primary_category", "hate_speech_score", "mhs_label", "expected_semantic_label"]) assert.ok(!header.includes(hidden));
  assert.deepEqual(header, [...MHS_SEMANTIC_REVIEW_COLUMNS]); assert.doesNotMatch(header.join(" "), /frozen.*benchmark/i); });
test("H preparation leaves all reviewer input columns blank", () => assert.doesNotThrow(() => validatePreparedMhsSemanticReviewCsv(packet().csv, packet().manifest)));
test("H completed-packet validator accepts only the bounded enum", () => { const prepared = packet(); const valid = parseCompletedMhsSemanticReviewCsv(completeCsv(prepared.csv), prepared.manifest, "semantic_reviewer_01");
  assert.equal(valid.length, 150); assert.deepEqual(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES, ["DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION"]);
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(completeCsv(prepared.csv, "ALLOW"), prepared.manifest, "semantic_reviewer_01"), /Invalid semantic relationship/); });
test("H validator rejects changed candidate text", () => { const prepared = packet(); const csv = mutateCsv(completeCsv(prepared.csv), (rows) => { rows[0].candidate_a_text += "changed"; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(csv, prepared.manifest, "semantic_reviewer_01"), /text changed/); });
test("H validator rejects changed candidate digest", () => { const prepared = packet(); const csv = mutateCsv(completeCsv(prepared.csv), (rows) => { rows[0].candidate_a_digest = "0".repeat(64); });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(csv, prepared.manifest, "semantic_reviewer_01"), /digest changed/); });
test("H validator rejects unknown pairs", () => { const prepared = packet(); const csv = mutateCsv(completeCsv(prepared.csv), (rows) => { rows[0].candidate_a_id = "src_unknown"; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(csv, prepared.manifest, "semantic_reviewer_01"), /Unknown/); });
test("H validator rejects duplicate pairs", () => { const prepared = packet(); const csv = mutateCsv(completeCsv(prepared.csv), (rows) => { for (const field of ["candidate_a_id", "candidate_b_id"] as const) rows[1][field] = rows[0][field]; });
  assert.throws(() => parseCompletedMhsSemanticReviewCsv(csv, prepared.manifest, "semantic_reviewer_01"), /Duplicate/); });
test("H preserves candidate membership, judgments, and training ineligibility", () => { const source = candidate(); const admitted = source.rows.filter((row) => row.candidateAdmitted); const byId = new Map(source.rows.map((row) => [row.sourceRowId, row]));
  assert.equal(admitted.length, 86); assert.equal(source.candidatePayloadDigest, MHS_CANDIDATE_PAYLOAD_DIGEST); assert.equal(shaFile(candidatePath), MHS_CANDIDATE_ARTIFACT_SHA256);
  assert.ok(packet().rows.every((row) => byId.get(row.candidateAId)?.reviewerDecision === row.candidateADecision && byId.get(row.candidateBId)?.reviewerDecision === row.candidateBDecision)); assert.ok(source.rows.every((row) => row.trainingEligible === false)); });
test("H generated packet bytes are deterministic and contain mixed-script representation", () => { const first = packet(); const second = packet(); assert.equal(first.csv, second.csv);
  assert.equal(JSON.stringify(first.manifest), JSON.stringify(second.manifest)); const summary = summarizeMhsSemanticReviewPacket(first.manifest, first.csv); assert.ok((summary.multilingualOrMixedScriptCount as number) >= 4); });
