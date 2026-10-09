import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseCsv } from "../../research/textModerationDataset/csv";
import { canonicalJson, sha256 } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
  MhsV2SemanticCalibrationJudgment,
  MhsV2SemanticCalibrationReviewCertification,
  createMhsV2SemanticCalibrationCompletedReview,
  createMhsV2SemanticCalibrationReviewCertification,
  publishMhsV2SemanticCalibrationCompletedReview,
  validateMhsV2SemanticCalibrationCompletedReview,
  validateMhsV2SemanticCalibrationReviewCertification,
} from "../../research/textModerationDataset/mhsV2SemanticCalibrationReviewValidation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
} from "../../research/textModerationDataset/mhsV2SemanticCalibrationExecution";
import { MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME } from "../../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";

const root = path.resolve(__dirname, "../../..");
const directory = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration");
const inputs = {
  policyBytes: fs.readFileSync(path.join(directory, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME)),
  membershipBytes: fs.readFileSync(path.join(directory, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME)),
  blindedCsv: fs.readFileSync(path.join(directory, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME), "utf8"),
  judgments: MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS,
};
const completed = createMhsV2SemanticCalibrationCompletedReview(inputs);
const certification = createMhsV2SemanticCalibrationReviewCertification(completed, inputs);
const csvCell = (value: string): string => `"${value.replace(/"/gu, '""')}"`;
const rewrite = (csv: string, mutate: (rows: Record<string, string>[]) => void): string => {
  const rows = parseCsv(csv).map((row) => ({ ...row })); mutate(rows);
  return `${MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
};
const judgments = (mutate: (rows: MhsV2SemanticCalibrationJudgment[]) => void): readonly MhsV2SemanticCalibrationJudgment[] => { const rows = inputs.judgments.map((row) => ({ ...row })); mutate(rows); return rows; };

test("A1R-V accepts exactly 300 authoritative judgments and corrected counts", () => {
  const validated = validateMhsV2SemanticCalibrationCompletedReview(completed, inputs); const counts = Object.fromEntries(Object.keys(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS).map((outcome) => [outcome, validated.judgments.filter((row) => row.semanticRelationship === outcome).length]));
  assert.equal(validated.judgments.length, 300); assert.deepEqual(counts, MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_OUTCOME_COUNTS);
  assert.deepEqual(inputs.judgments.filter((row) => row.semanticRelationship === "RELATED_BUT_DISTINCT").map((row) => row.reviewRowNumber), [7, 10, 14, 19, 21, 43, 44, 50, 55, 71, 76, 102, 128, 131, 156, 180, 183, 200, 228, 262, 296]);
});

test("A1R-V completed artifact preserves all frozen identity/text cells and uses blank notes/timestamps", () => {
  const original = parseCsv(inputs.blindedCsv), result = parseCsv(completed); assert.equal(result.length, 300);
  result.forEach((row, index) => { for (const column of MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.slice(0, 11)) assert.equal(row[column], original[index][column]); assert.equal(row.reviewer_id_input, "reviewer_a_01"); assert.equal(row.reviewer_note_input, ""); assert.equal(row.reviewed_at_input, ""); });
});

test("A1R-V deterministic replay is byte-identical and digest-identical", () => {
  const replay = createMhsV2SemanticCalibrationCompletedReview(inputs), replayCertification = createMhsV2SemanticCalibrationReviewCertification(replay, inputs);
  assert.equal(replay, completed); assert.equal(replayCertification.review.canonicalReviewPayloadDigest, certification.review.canonicalReviewPayloadDigest); assert.equal(canonicalJson(replayCertification), canonicalJson(certification));
});

test("A1R-V certification is canonical, text-free, authority-bound, and non-progressing", () => {
  validateMhsV2SemanticCalibrationReviewCertification(certification); const serialized = canonicalJson(certification);
  assert.equal(certification.review.completedArtifactSha256, sha256(Buffer.from(completed, "utf8"))); assert.equal(serialized.includes("candidate_a_text"), false); assert.ok(Object.values(certification.boundaries).every((value) => value === false)); assert.ok(Object.values(certification.reconciliation).every((value) => value === 0));
});

test("A1R-V paired publication is atomic and refuses replay/overwrite", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-a1rv-")); try { const result = publishMhsV2SemanticCalibrationCompletedReview(completed, certification, target); assert.deepEqual([path.basename(result.completedPath), path.basename(result.certificationPath)], [MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME]); assert.throws(() => publishMhsV2SemanticCalibrationCompletedReview(completed, certification, target), /overwrite refused/u); } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test("A1R-V failed paired publication rolls back its own partial output", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-a1rv-")); try { assert.throws(() => publishMhsV2SemanticCalibrationCompletedReview(completed, certification, target, (a, b) => { fs.renameSync(a, b); throw new Error("simulated"); }), /simulated/u); assert.equal(fs.existsSync(path.join(target, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME)), false); } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test("A1R-V rejects wrong policy, membership, and blinded packet bytes", () => {
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, policyBytes: Buffer.concat([inputs.policyBytes, Buffer.from(" ")]) }), /policy artifact SHA/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, membershipBytes: Buffer.concat([inputs.membershipBytes, Buffer.from(" ")]) }), /membership artifact SHA/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, blindedCsv: `${inputs.blindedCsv} ` }), /blinded packet SHA/u);
});

test("A1R-V rejects 299, 301, missing, duplicate, and unknown judgment rows", () => {
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: inputs.judgments.slice(0, 299) }), /exactly 300/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: [...inputs.judgments, inputs.judgments[0]] }), /exactly 300/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[299] = { ...rows[0] }; }) }), /duplicate review row/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[299] = { ...rows[299], reviewRowNumber: 301 }; }) }), /unknown review row/u);
});

test("A1R-V rejects invalid, blank, unresolved, and aggregate-drifting outcomes", () => {
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[0] = { ...rows[0], semanticRelationship: "INVALID" as never }; }) }), /invalid or blank/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[0] = { ...rows[0], semanticRelationship: "" as never }; }) }), /invalid or blank/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[0] = { ...rows[0], semanticRelationship: "NEEDS_ADJUDICATION" }; }) }), /count mismatch|unresolved/u);
  assert.throws(() => createMhsV2SemanticCalibrationCompletedReview({ ...inputs, judgments: judgments((rows) => { rows[0] = { ...rows[0], semanticRelationship: "RELATED_BUT_DISTINCT" }; }) }), /count mismatch/u);
});

test("A1R-V rejects shifted judgments and reviewer identity mutation", () => {
  assert.throws(() => validateMhsV2SemanticCalibrationCompletedReview(rewrite(completed, (rows) => { const first = rows[0].semantic_relationship_input; rows[0].semantic_relationship_input = rows[6].semantic_relationship_input; rows[6].semantic_relationship_input = first; }), inputs), /judgment authority mismatch/u);
  assert.throws(() => validateMhsV2SemanticCalibrationCompletedReview(rewrite(completed, (rows) => { rows[0].reviewer_id_input = "reviewer_b_01"; }), inputs), /reviewer metadata mismatch/u);
});

test("A1R-V rejects pair/candidate/text-hash identity mutations", () => {
  for (const column of ["pair_id", "candidate_a_id", "candidate_b_id", "candidate_a_text_sha256", "candidate_b_text_sha256"] as const) assert.throws(() => validateMhsV2SemanticCalibrationCompletedReview(rewrite(completed, (rows) => { rows[0][column] = `${rows[0][column]}-mutation`; }), inputs), /completed identity mismatch/u);
});

test("A1R-V rejects candidate text mutation and prohibited columns", () => {
  assert.throws(() => validateMhsV2SemanticCalibrationCompletedReview(rewrite(completed, (rows) => { rows[0].candidate_a_text = `${rows[0].candidate_a_text} mutation`; }), inputs), /completed identity mismatch/u);
  const prohibited = completed.replace(/\r\n/u, ',"semantic_score"\r\n'); assert.throws(() => validateMhsV2SemanticCalibrationCompletedReview(prohibited, inputs));
});

test("A1R-V refuses completed/certification digest mismatch and certification mutation", () => {
  assert.throws(() => publishMhsV2SemanticCalibrationCompletedReview(`${completed} `, certification, os.tmpdir()), /does not match/u);
  const mutated = { ...certification, reviewer: { ...certification.reviewer, reviewerId: "wrong" } } as unknown as MhsV2SemanticCalibrationReviewCertification;
  assert.throws(() => validateMhsV2SemanticCalibrationReviewCertification(mutated), /Invalid A1R-V/u);
});

test("A1R-V validates real immutable publication when present", () => {
  const completedPath = path.join(directory, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME), certificationPath = path.join(directory, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME); if (!fs.existsSync(completedPath) && !fs.existsSync(certificationPath)) return;
  assert.ok(fs.existsSync(completedPath) && fs.existsSync(certificationPath)); const actualCompleted = fs.readFileSync(completedPath, "utf8"), actualCertification = JSON.parse(fs.readFileSync(certificationPath, "utf8")) as MhsV2SemanticCalibrationReviewCertification;
  assert.equal(actualCompleted, completed); assert.equal(canonicalJson(actualCertification), canonicalJson(certification)); validateMhsV2SemanticCalibrationReviewCertification(actualCertification);
  assert.deepEqual([sha256(Buffer.from(actualCompleted)), actualCertification.review.canonicalReviewPayloadDigest, sha256(Buffer.from(canonicalJson(actualCertification))), actualCertification.certificationPayloadDigest], [MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST]);
});
