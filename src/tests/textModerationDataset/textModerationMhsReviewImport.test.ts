import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CsvRecord, parseCsv } from "../../research/textModerationDataset/csv";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { REVIEWER_PACKET_COLUMNS } from "../../research/textModerationDataset/mhsReviewPilot";
import {
  MHS_REVIEWER_A_ID, MHS_REVIEWER_A_IMPORT_FILENAME, MHS_REVIEWER_A_PACKET_SHA256,
  MHS_REVIEW_IMPORT_SCHEMA_VERSION, importMhsReviewerA, validateMhsPilotReviewImportArtifact,
  writeImmutableFileAtomic,
} from "../../research/textModerationDataset/mhsReviewImport";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const packetPath = path.join(root, "mhs-review-pilot-v1-reviewer-a-CORRECTED.csv");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const reviewerBPath = path.join(root, "mhs-review-pilot-v1-reviewer-b.csv");
const candidatePath = path.join(root, "mhs-review-tranche-v1-public-reviewed-candidates.jsonl");
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const shaText = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const cell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const toCsv = (records: readonly CsvRecord[]): string => `${REVIEWER_PACKET_COLUMNS.map(cell).join(",")}\r\n${records.map((record) => REVIEWER_PACKET_COLUMNS.map((column) => cell(record[column])).join(",")).join("\r\n")}\r\n`;
const temp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-review-import-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const options = (directory: string, packet = packetPath) => ({ packetPath: packet, parentTranchePath: parentPath,
  outputDirectory: path.join(directory, "reviews"), importedAt: "2026-09-11T09:00:00.000Z" });
const mutatedPacket = (directory: string, mutate: (rows: Record<string, string>[]) => void): string => {
  const rows = parseCsv(fs.readFileSync(packetPath, "utf8")).map((row) => ({ ...row })); mutate(rows);
  const filename = path.join(directory, "mutated.csv"); fs.writeFileSync(filename, toCsv(rows), "utf8"); return filename;
};

test("T6L-6J-B valid Reviewer A import succeeds", () => {
  const directory = temp(); try { const result = importMhsReviewerA(options(directory)); assert.ok(fs.existsSync(result.artifactPath)); assert.equal(result.artifact.rowCount, 100); } finally { clean(directory); }
});

test("T6L-6J-B import implementation uses the existing completed-packet parser", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsReviewImport.ts"), "utf8");
  assert.match(source, /parseCompletedMhsPilotPacket\(packetBytes\.toString\("utf8"\), "A", MHS_REVIEWER_A_ID, pilot\)/);
});

test("T6L-6J-B wrong packet SHA fails", () => {
  const directory = temp(); try { assert.throws(() => importMhsReviewerA({ ...options(directory), expectedPacketSha256: "0".repeat(64) }), /SHA-256 mismatch/); } finally { clean(directory); }
});

test("T6L-6J-B wrong packet role fails", () => {
  const directory = temp(); try { const file = mutatedPacket(directory, (rows) => rows.forEach((row) => { row.packet_role = "B"; }));
    assert.throws(() => importMhsReviewerA({ ...options(directory, file), expectedPacketSha256: shaFile(file) }), /SHA-256 mismatch|role mismatch/); } finally { clean(directory); }
});

test("T6L-6J-B wrong reviewer ID fails", () => {
  const directory = temp(); try { const file = mutatedPacket(directory, (rows) => rows.forEach((row) => { row.reviewer_id_input = "someone_else"; }));
    assert.throws(() => importMhsReviewerA({ ...options(directory, file), expectedPacketSha256: shaFile(file) }), /SHA-256 mismatch|identity mismatch/); } finally { clean(directory); }
});

test("T6L-6J-B malformed packet fails", () => {
  const directory = temp(); try { const file = path.join(directory, "malformed.csv"); fs.writeFileSync(file, "not,a,packet\n", "utf8");
    assert.throws(() => importMhsReviewerA({ ...options(directory, file), expectedPacketSha256: shaFile(file) }), /SHA-256 mismatch|CSV/); } finally { clean(directory); }
});

test("T6L-6J-B altered immutable text or digest fails", () => {
  const directory = temp(); try { const file = mutatedPacket(directory, (rows) => { rows[0].text_to_review += " altered"; });
    assert.throws(() => importMhsReviewerA({ ...options(directory, file), expectedPacketSha256: shaFile(file) }), /SHA-256 mismatch|Altered text or digest/); } finally { clean(directory); }
});

test("T6L-6J-B duplicate role import fails", () => {
  const directory = temp(); try { importMhsReviewerA(options(directory)); assert.throws(() => importMhsReviewerA(options(directory)), /already imported/); } finally { clean(directory); }
});

test("T6L-6J-B overwrite attempt preserves the existing target", () => {
  const directory = temp(); try { const output = path.join(directory, "reviews"); fs.mkdirSync(output); const target = path.join(output, MHS_REVIEWER_A_IMPORT_FILENAME); fs.writeFileSync(target, "sentinel", "utf8");
    assert.throws(() => importMhsReviewerA(options(directory)), /refused/); assert.equal(fs.readFileSync(target, "utf8"), "sentinel"); } finally { clean(directory); }
});

test("T6L-6J-B same packet hash under another role fails", () => {
  const directory = temp(); try { const output = path.join(directory, "reviews"); fs.mkdirSync(output); fs.writeFileSync(path.join(output, "reviewer-b.json"), canonicalJson({ reviewerRole: "B", packetSha256: MHS_REVIEWER_A_PACKET_SHA256 }));
    assert.throws(() => importMhsReviewerA(options(directory)), /another reviewer role/); } finally { clean(directory); }
});

test("T6L-6J-B retired historical Reviewer B packet remains unchanged", () => {
  const before = shaFile(reviewerBPath); const directory = temp(); try { importMhsReviewerA(options(directory)); assert.equal(shaFile(reviewerBPath), before); } finally { clean(directory); }
});

test("T6L-6J-B existing durable Reviewer A artifact remains valid and unchanged", () => {
  const durablePath = path.join(root, "reviews", MHS_REVIEWER_A_IMPORT_FILENAME); const bytes = fs.readFileSync(durablePath);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "dec27e33770eadb4d0cb65b2d5cbb77c3694a6707f68cbcc25702bdd1eab31b6");
  assert.doesNotThrow(() => validateMhsPilotReviewImportArtifact(JSON.parse(bytes.toString("utf8"))));
});

test("T6L-6J-B parent tranche remains unchanged", () => {
  const before = shaFile(parentPath); const directory = temp(); try { importMhsReviewerA(options(directory)); assert.equal(shaFile(parentPath), before); } finally { clean(directory); }
});

test("T6L-6J-B candidate output remains unchanged", () => {
  const before = shaFile(candidatePath); const directory = temp(); try { importMhsReviewerA(options(directory)); assert.equal(shaFile(candidatePath), before); } finally { clean(directory); }
});

test("T6L-6J-B import creates no training eligibility", () => {
  const rows = fs.readFileSync(parentPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); assert.equal(rows.filter((row) => row.trainingEligible).length, 0);
});

test("T6L-6J-B artifact contains required identity and integrity metadata", () => {
  const directory = temp(); try { const result = importMhsReviewerA(options(directory)); const artifact = JSON.parse(fs.readFileSync(result.artifactPath, "utf8"));
    assert.equal(artifact.schemaVersion, MHS_REVIEW_IMPORT_SCHEMA_VERSION); assert.equal(artifact.packetSha256, MHS_REVIEWER_A_PACKET_SHA256);
    assert.equal(artifact.reviewerId, MHS_REVIEWER_A_ID); assert.equal(artifact.validationStatus, "VALIDATED"); assert.equal(artifact.reviews.length, 100);
    assert.equal(result.artifactSha256, shaText(fs.readFileSync(result.artifactPath, "utf8"))); assert.doesNotThrow(() => validateMhsPilotReviewImportArtifact(artifact)); } finally { clean(directory); }
});

test("T6L-6J-B artifact is role A only", () => {
  const directory = temp(); try { const { artifact } = importMhsReviewerA(options(directory)); assert.equal(artifact.reviewerRole, "A"); assert.equal(artifact.sourcePacketRole, "A"); assert.ok(artifact.reviews.every((item) => item.review.slot === "A"));
    assert.ok(!Object.prototype.hasOwnProperty.call(artifact, "reviewerB") && !Object.prototype.hasOwnProperty.call(artifact, "adjudication") && !Object.prototype.hasOwnProperty.call(artifact, "trainingEligible")); } finally { clean(directory); }
});

test("T6L-6J-B atomic publication failure leaves no partial authoritative artifact", () => {
  const directory = temp(); try { const target = path.join(directory, "artifact.json"); assert.throws(() => writeImmutableFileAtomic(target, "complete", () => { throw new Error("simulated publish failure"); }), /simulated/);
    assert.equal(fs.existsSync(target), false); assert.deepEqual(fs.readdirSync(directory), []); } finally { clean(directory); }
});
