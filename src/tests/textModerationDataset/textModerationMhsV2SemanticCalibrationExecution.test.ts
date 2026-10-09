import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseCsv } from "../../research/textModerationDataset/csv";
import { canonicalJson, sha256 } from "../../research/textModerationDataset/manifest";
import { MhsV2ExpansionCandidateArtifact } from "../../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, MhsV2SemanticCalibrationPolicyArtifact,
} from "../../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256, MhsV2CalibrationCandidate, MhsV2CalibrationScoredPair,
  createMhsV2SemanticCalibrationMembership, createMhsV2SemanticCalibrationReviewCsv, enumerateMhsV2CalibrationPairs,
  mhsV2CalibrationRegion, publishMhsV2SemanticCalibrationPacket, selectMhsV2CalibrationControls,
  selectMhsV2CalibrationPairs, validateMhsV2SemanticCalibrationMembership, validatePreparedMhsV2SemanticCalibrationReviewCsv,
} from "../../research/textModerationDataset/mhsV2SemanticCalibrationExecution";

const root = path.resolve(__dirname, "../../.."); const calibration = path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration");
const policyPath = path.join(calibration, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME);
const sha = (value: Buffer | string): string => sha256(typeof value === "string" ? Buffer.from(value, "utf8") : value);
const digestFor = (value: string): string => sha(value);
const v2: MhsV2CalibrationCandidate[] = Array.from({ length: 400 }, (_, index) => { const text = index === 0 ? "+formula-safe-binding" : `V2 text ${index}`; return { namespace: "V2", candidateId: `V2-${String(index + 1).padStart(3, "0")}`, textSha256: digestFor(text), text }; });
const historical: MhsV2CalibrationCandidate[] = Array.from({ length: 73 }, (_, index) => { const text = `Historical text ${index}`; return { namespace: "HISTORICAL_DEVELOPMENT", candidateId: `H-${String(index + 1).padStart(3, "0")}`, textSha256: digestFor(text), text }; });
const pairs = enumerateMhsV2CalibrationPairs(v2, historical); const controls = selectMhsV2CalibrationControls(pairs);
const scores = [0.9, 0.845, 0.835, 0.825, 0.81, 0.79, 0.7] as const;
const scored = { A: pairs.A.map((pair, index): MhsV2CalibrationScoredPair => ({ ...pair, score: scores[index % scores.length] })), B: pairs.B.map((pair, index): MhsV2CalibrationScoredPair => ({ ...pair, score: scores[index % scores.length] })) };
const policyBytes = fs.readFileSync(policyPath); const policy = JSON.parse(policyBytes.toString("utf8")) as MhsV2SemanticCalibrationPolicyArtifact;
const result = selectMhsV2CalibrationPairs(controls, scored); const artifact = createMhsV2SemanticCalibrationMembership(policy, result, true);
const csv = createMhsV2SemanticCalibrationReviewCsv(artifact, [...v2, ...historical]);

test("A1R-X frozen policy and real candidate authority hashes are exact", () => {
  assert.equal(sha(policyBytes), MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256); assert.equal(policy.policyPayloadDigest, MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST);
  assert.equal(sha(fs.readFileSync(path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/candidates/mhs-v2-expansion-candidates-v1.json"))), "972dd6b681fe953e10cc66eeb5dd15091bed86b60df19171a46cf31d45a463d0");
  assert.equal(sha(fs.readFileSync(path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/development/mhs-development-text-projection-v1.jsonl"))), "9a75ebe2ffa102dddee7235ed69fafbf94d9cad03e603e9e65303e31e73f9ba1");
});

test("A1R-X enumerates only the exact non-protected 109,000-pair universe", () => {
  assert.deepEqual([v2.length, historical.length, pairs.A.length, pairs.B.length, pairs.A.length + pairs.B.length], [400, 73, 79800, 29200, 109000]);
  assert.equal(new Set([...pairs.A, ...pairs.B].map((pair) => pair.pairId)).size, 109000); assert.ok(pairs.A.every((pair) => pair.scope === "A")); assert.ok(pairs.B.every((pair) => pair.scope === "B"));
});

test("A1R-X freezes 45/15 score-independent C1 controls", () => {
  assert.deepEqual([controls.filter((pair) => pair.scope === "A").length, controls.filter((pair) => pair.scope === "B").length], [45, 15]);
  assert.equal(canonicalJson(controls), canonicalJson(selectMhsV2CalibrationControls(pairs)));
});

test("A1R-X score boundaries are exact and below 0.78 is excluded", () => {
  assert.deepEqual([mhsV2CalibrationRegion(0.85), mhsV2CalibrationRegion(0.849999), mhsV2CalibrationRegion(0.84), mhsV2CalibrationRegion(0.83), mhsV2CalibrationRegion(0.82), mhsV2CalibrationRegion(0.8), mhsV2CalibrationRegion(0.78), mhsV2CalibrationRegion(0.779999)], ["R1", "R2", "R2", "R3", "R4", "R5", "R6", null]);
});

test("A1R-X frozen sampling satisfies every quota, identity, disjointness, and reuse invariant", () => {
  const controlIds = new Set(controls.map((pair) => pair.pairId));
  assert.equal(result.selected.length, 300); assert.equal(new Set(result.selected.map((row) => row.pairId)).size, 300); assert.ok(result.maximumCandidateReuse <= 8);
  assert.deepEqual(result.selectedCounts.A, { C1: 45, R1: 30, R2: 30, R3: 30, R4: 30, R5: 30, R6: 25 });
  assert.deepEqual(result.selectedCounts.B, { C1: 15, R1: 10, R2: 10, R3: 10, R4: 10, R5: 10, R6: 15 });
  assert.ok(result.selected.filter((row) => row.stratum !== "C1").every((row) => !controlIds.has(row.pairId)));
});

test("A1R-X deterministic replay produces byte-identical membership", () => {
  assert.equal(canonicalJson(result), canonicalJson(selectMhsV2CalibrationPairs(controls, scored)));
});

test("A1R-X quota underflow fails closed without redistribution", () => {
  const unavailable = { A: scored.A.map((pair) => ({ ...pair, score: 0.7 })), B: scored.B.map((pair) => ({ ...pair, score: 0.7 })) };
  assert.throws(() => selectMhsV2CalibrationPairs(controls, unavailable), /scope A; region R1; required 30; available 0; availableAfterReuse 0; selected 0; limitingCondition SCORE_SCARCITY/u);
});

test("A1R-X machine authority is text-free and preserves frozen non-progression boundaries", () => {
  validateMhsV2SemanticCalibrationMembership(artifact);
  assert.equal(artifact.rows.length, 300); assert.equal(JSON.stringify(artifact).includes("V2 text"), false); assert.equal(JSON.stringify(artifact).includes("Historical text"), false);
  assert.ok(Object.values(artifact.protections).every((value) => value === false)); assert.throws(() => createMhsV2SemanticCalibrationMembership(policy, result, false), /replay mismatch/u);
});

test("A1R-X blinded CSV is exact-text-bound, blank, quote-all, and contains no forbidden machine metadata", () => {
  validatePreparedMhsV2SemanticCalibrationReviewCsv(csv, artifact, [...v2, ...historical]); const rows = parseCsv(csv);
  assert.equal(rows.length, 300); assert.deepEqual(Object.keys(rows[0]), [...MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS]); assert.ok(csv.split(/\r\n/u).filter(Boolean).every((line) => line.startsWith('"')));
  assert.ok(rows.every((row) => row.semantic_relationship_input === "" && row.reviewer_note_input === "" && row.reviewer_id_input === "" && row.reviewed_at_input === ""));
  assert.ok(Object.keys(rows[0]).every((column) => !/score|stratum|control|moderation|category|reason|split|protected|training|eligib/iu.test(column)));
});

test("A1R-X paired publication is canonical, immutable, and replay-refusing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-a1rx-")); try {
    const published = publishMhsV2SemanticCalibrationPacket(artifact, csv, directory); assert.equal(fs.readFileSync(published.membershipPath, "utf8"), canonicalJson(artifact)); assert.equal(fs.readFileSync(published.reviewPath, "utf8"), csv);
    assert.deepEqual([path.basename(published.membershipPath), path.basename(published.reviewPath)], [MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME]);
    assert.throws(() => publishMhsV2SemanticCalibrationPacket(artifact, csv, directory), /overwrite refused/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("A1R-X validates the real published artifacts when present", () => {
  const membershipPath = path.join(calibration, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME), reviewPath = path.join(calibration, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME);
  if (!fs.existsSync(membershipPath) && !fs.existsSync(reviewPath)) return;
  assert.ok(fs.existsSync(membershipPath) && fs.existsSync(reviewPath)); const membershipBytes = fs.readFileSync(membershipPath); const reviewBytes = fs.readFileSync(reviewPath); const artifact = JSON.parse(membershipBytes.toString("utf8")); validateMhsV2SemanticCalibrationMembership(artifact);
  assert.deepEqual([sha(membershipBytes), artifact.membershipPayloadDigest, artifact.membershipDigest, sha(reviewBytes)], [MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256]);
  const realV2 = JSON.parse(fs.readFileSync(path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/candidates/mhs-v2-expansion-candidates-v1.json"), "utf8")) as MhsV2ExpansionCandidateArtifact;
  const development = fs.readFileSync(path.join(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/development/mhs-development-text-projection-v1.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const candidates: MhsV2CalibrationCandidate[] = [...realV2.rows.map((row) => ({ namespace: "V2" as const, candidateId: row.candidateId, textSha256: row.exactTextDigest, text: row.text })), ...development.map((row) => ({ namespace: "HISTORICAL_DEVELOPMENT" as const, candidateId: row.exampleId, textSha256: row.candidateTextDigest, text: row.text }))];
  validatePreparedMhsV2SemanticCalibrationReviewCsv(reviewBytes.toString("utf8"), artifact, candidates);
});
