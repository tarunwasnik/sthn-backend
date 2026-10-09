import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import {
  MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_SIZE, REVIEWER_PACKET_COLUMNS,
  createMhsPilotReviewerCsv, mhsReviewPilotMembershipDigest, parseCompletedMhsPilotPacket,
  selectMhsReviewPilot, validatePreparedMhsPilotPacket,
} from "../../research/textModerationDataset/mhsReviewPilot";
import {
  MHS_REVIEW_ALLOCATION, MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MhsReviewTrancheRow,
  mhsReviewTrancheMembershipDigest,
} from "../../research/textModerationDataset/mhsReviewTranche";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const candidatePath = path.join(root, "mhs-review-tranche-v1-public-reviewed-candidates.jsonl");
const digestFile = (file: string): string => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const parent: readonly MhsReviewTrancheRow[] = fs.readFileSync(parentPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
const pilot = selectMhsReviewPilot(parent);
const packetA = createMhsPilotReviewerCsv(pilot, "A");
const cell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const toCsv = (records: readonly CsvRecord[]): string => `${REVIEWER_PACKET_COLUMNS.map(cell).join(",")}\r\n${records.map((record) => REVIEWER_PACKET_COLUMNS.map((column) => cell(record[column])).join(",")).join("\r\n")}\r\n`;
const mutate = (csv: string, change: (rows: Record<string, string>[]) => void): string => {
  const rows = parseCsv(csv).map((row) => ({ ...row })); change(rows); return toCsv(rows);
};
const completed = (csv: string, reviewerId: string): string => mutate(csv, (rows) => rows.forEach((row) => {
  row.pii_disposition_input = "NONE";
  row.decision_input = "ALLOW";
  row.reason_code_input = "POLICY_ACCEPTABLE";
  row.reviewer_id_input = reviewerId;
  row.independence_declaration_input = "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS";
  row.reviewed_at_input = "2026-09-09T10:00:00.000Z";
}));

test("T6L-6J-A pilot contains exactly 100 rows", () => assert.equal(pilot.length, MHS_REVIEW_PILOT_SIZE));

test("T6L-6J-A every pilot row belongs to the frozen parent tranche", () => {
  assert.equal(mhsReviewTrancheMembershipDigest(parent), MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST);
  const parentIds = new Set(parent.map((row) => row.sourceRowId)); assert.ok(pilot.every((row) => parentIds.has(row.sourceRowId)));
});

test("T6L-6J-A pilot comment membership is unique", () => assert.equal(new Set(pilot.map((row) => row.commentId)).size, 100));

test("T6L-6J-A pilot selection is deterministic", () => assert.deepEqual(selectMhsReviewPilot(parent), pilot));

test("T6L-6J-A membership is frozen by digest", () => assert.equal(mhsReviewPilotMembershipDigest(pilot), MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST));

test("T6L-6J-A preserves all five parent allocations", () => Object.keys(MHS_REVIEW_ALLOCATION).forEach((allocation) => {
  assert.equal(pilot.filter((row) => row.allocation === allocation).length, 20);
}));

test("T6L-6J-A generates only the sole Reviewer A packet", () => {
  assert.equal(parseCsv(packetA).length, 100);
  assert.throws(() => createMhsPilotReviewerCsv(pilot, "B" as never), /sole active/);
  const generator = fs.readFileSync(path.resolve(process.cwd(), "src", "scripts", "prepareMhsReviewPilot.ts"), "utf8");
  assert.ok(!generator.includes("reviewer-b.csv") && !generator.includes("reviewerBCompleted"));
});

test("T6L-6J-A prepared Reviewer A packet has blank reviewer inputs", () => {
  assert.doesNotThrow(() => validatePreparedMhsPilotPacket(packetA, "A", pilot));
});

test("T6L-6J-A packets expose no prior STHN judgments", () => {
  const forbidden = ["reviewA", "reviewB", "finalDecision", "humanDecision", "trainingEligible", "adjudication"];
  assert.ok(forbidden.every((name) => !REVIEWER_PACKET_COLUMNS.some((column) => column.toLowerCase().includes(name.toLowerCase()))));
});

test("T6L-6J-A packets expose no source toxicity scores or answer labels", () => {
  const forbidden = ["score", "hate_speech_score", "answer", "label", "source_evidence", "original_labels", "allocation", "strata"];
  assert.ok(forbidden.every((name) => !REVIEWER_PACKET_COLUMNS.some((column) => column.toLowerCase().includes(name))));
});

test("T6L-6J-A packets expose no annotator demographic metadata", () => {
  const forbidden = ["annotator", "demographic", "race", "gender", "religion", "age", "education", "income"];
  assert.ok(forbidden.every((name) => !REVIEWER_PACKET_COLUMNS.some((column) => column.toLowerCase().includes(name))));
});

test("T6L-6J-A validation rejects altered text or digest", () => {
  const altered = mutate(packetA, (rows) => { rows[0].text_to_review += " altered"; });
  assert.throws(() => validatePreparedMhsPilotPacket(altered, "A", pilot), /Altered text or digest/);
});

test("T6L-6J-A validation rejects unknown rows", () => {
  const unknown = mutate(packetA, (rows) => { rows[0].source_row_id = "unknown:row"; });
  assert.throws(() => validatePreparedMhsPilotPacket(unknown, "A", pilot), /Unknown pilot row/);
});

test("T6L-6J-A validation rejects duplicate rows", () => {
  const duplicate = mutate(packetA, (rows) => { rows[1] = { ...rows[0] }; });
  assert.throws(() => validatePreparedMhsPilotPacket(duplicate, "A", pilot), /Duplicate pilot row/);
});

test("T6L-6J-A validation rejects retired role, reviewer identity, and invalid enums", () => {
  assert.throws(() => validatePreparedMhsPilotPacket(packetA, "B" as never, pilot), /sole active/);
  const ready = completed(packetA, "reviewer-a");
  assert.throws(() => parseCompletedMhsPilotPacket(ready, "A", "reviewer-b", pilot), /identity mismatch/);
  const invalid = mutate(ready, (rows) => { rows[0].decision_input = "APPROVE"; });
  assert.throws(() => parseCompletedMhsPilotPacket(invalid, "A", "reviewer-a", pilot), /Invalid decision/);
});

test("T6L-6J-A pilot preparation leaves the parent artifact unchanged", () => {
  const before = digestFile(parentPath); selectMhsReviewPilot(parent); assert.equal(digestFile(parentPath), before);
});

test("T6L-6J-A frozen parent and candidate outputs retain zero training eligibility", () => {
  assert.ok(parent.every((row) => row.reviewA === null && row.reviewB === null && row.trainingEligible === false));
  assert.equal(fs.statSync(candidatePath).size, 0);
});
