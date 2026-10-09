import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createMhsCandidateAdmission, deriveMhsCandidateState, MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION,
  MHS_CANDIDATE_ARTIFACT_FILENAME, MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256, MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST,
  validateMhsCandidateAdmissionArtifact,
} from "../../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_REVIEWER_A_ARTIFACT_SHA256, MhsReviewResolutionArtifact, validateMhsReviewResolutionArtifact } from "../../research/textModerationDataset/mhsReviewResolution";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const resolutionPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-resolution.json");
const reviewerPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-validated.json");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const legacyCandidatePath = path.join(root, "mhs-review-tranche-v1-public-reviewed-candidates.jsonl");
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const temporaryDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-candidate-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const options = (directory: string, resolutionArtifactPath = resolutionPath, reviewerArtifactPath = reviewerPath) => ({
  resolutionArtifactPath, reviewerArtifactPath, parentTranchePath: parentPath, outputDirectory: path.join(directory, "candidates"), generatedAt: "2026-09-11T12:00:00.000Z",
});
const resolution = (): MhsReviewResolutionArtifact => JSON.parse(fs.readFileSync(resolutionPath, "utf8")) as MhsReviewResolutionArtifact;
const stateInput = (reviewerDecision: "ALLOW" | "BLOCK" | "NEEDS_ADJUDICATION" | "EXCLUDE", resolutionState: "RESOLVED_ALLOW" | "RESOLVED_BLOCK" | "UNRESOLVED_ADJUDICATION" | "EXCLUDED", piiDisposition: "NONE" | "REQUIRES_REVIEW" | "EXCLUDE") => ({
  reviewerDecision, resolutionState, piiDisposition, piiGateState: piiDisposition === "NONE" ? "PII_CLEAR" as const : piiDisposition === "REQUIRES_REVIEW" ? "PII_REVIEW_REQUIRED" as const : "PII_EXCLUDED" as const,
});

test("T6L-6J-D valid resolution builds a candidate artifact", () => {
  const directory = temporaryDirectory(); try { const result = createMhsCandidateAdmission(options(directory));
    assert.equal(result.artifact.schemaVersion, MHS_CANDIDATE_ADMISSION_SCHEMA_VERSION); assert.equal(result.artifact.rowCount, 100);
    assert.equal(result.artifactSha256, shaFile(result.artifactPath)); assert.doesNotThrow(() => validateMhsCandidateAdmissionArtifact(JSON.parse(fs.readFileSync(result.artifactPath, "utf8"))));
  } finally { clean(directory); }
});

test("T6L-6J-D verifies resolution SHA-256", () => {
  assert.equal(shaFile(resolutionPath), MHS_REVIEW_RESOLUTION_ARTIFACT_SHA256); const directory = temporaryDirectory(); try {
    const changed = path.join(directory, "resolution.json"); fs.writeFileSync(changed, `${fs.readFileSync(resolutionPath, "utf8")} `);
    assert.throws(() => createMhsCandidateAdmission(options(directory, changed)), /resolution artifact SHA-256 mismatch/);
  } finally { clean(directory); }
});

test("T6L-6J-D verifies canonical resolution digest", () => {
  const artifact = resolution(); assert.equal(artifact.resolutionPayloadDigest, MHS_REVIEW_RESOLUTION_PAYLOAD_DIGEST); assert.doesNotThrow(() => validateMhsReviewResolutionArtifact(artifact));
});

test("T6L-6J-D verifies Reviewer A provenance", () => {
  assert.equal(shaFile(reviewerPath), MHS_REVIEWER_A_ARTIFACT_SHA256); const directory = temporaryDirectory(); try {
    const changed = path.join(directory, "reviewer.json"); fs.writeFileSync(changed, `${fs.readFileSync(reviewerPath, "utf8")} `);
    assert.throws(() => createMhsCandidateAdmission(options(directory, resolutionPath, changed)), /Reviewer A provenance artifact SHA-256 mismatch/);
  } finally { clean(directory); }
});

test("T6L-6J-D resolved ALLOW plus PII NONE is admitted", () => assert.equal(deriveMhsCandidateState(stateInput("ALLOW", "RESOLVED_ALLOW", "NONE")), "ADMITTED_ALLOW"));
test("T6L-6J-D resolved BLOCK plus PII NONE is admitted", () => assert.equal(deriveMhsCandidateState(stateInput("BLOCK", "RESOLVED_BLOCK", "NONE")), "ADMITTED_BLOCK"));
test("T6L-6J-D PII REQUIRES_REVIEW is blocked", () => assert.equal(deriveMhsCandidateState(stateInput("ALLOW", "RESOLVED_ALLOW", "REQUIRES_REVIEW")), "BLOCKED_PII_REVIEW"));
test("T6L-6J-D NEEDS_ADJUDICATION is blocked", () => assert.equal(deriveMhsCandidateState(stateInput("NEEDS_ADJUDICATION", "UNRESOLVED_ADJUDICATION", "NONE")), "BLOCKED_ADJUDICATION"));
test("T6L-6J-D EXCLUDE remains excluded", () => assert.equal(deriveMhsCandidateState(stateInput("EXCLUDE", "EXCLUDED", "EXCLUDE")), "EXCLUDED"));

test("T6L-6J-D blocked rows cannot become admitted", () => {
  const directory = temporaryDirectory(); try { const rows = createMhsCandidateAdmission(options(directory)).artifact.rows.filter((row) => !row.candidateState.startsWith("ADMITTED_"));
    assert.ok(rows.length > 0); assert.ok(rows.every((row) => row.candidateAdmitted === false && row.reviewedText === null));
  } finally { clean(directory); }
});

test("T6L-6J-D admitted BLOCK categories are preserved exactly", () => {
  const directory = temporaryDirectory(); try { const candidate = createMhsCandidateAdmission(options(directory)).artifact;
    for (const row of candidate.rows.filter((item) => item.candidateState === "ADMITTED_BLOCK")) { const source = resolution().rows[row.pilotRowNumber - 1]; assert.equal(row.primaryCategory, source.primaryCategory); assert.deepEqual(row.secondaryCategories, source.secondaryCategories); }
  } finally { clean(directory); }
});

test("T6L-6J-D human judgments remain unchanged", () => {
  const directory = temporaryDirectory(); try { const source = resolution(); const candidate = createMhsCandidateAdmission(options(directory)).artifact;
    assert.deepEqual(candidate.rows.map((row) => ({ decision: row.reviewerDecision, primary: row.primaryCategory, secondary: row.secondaryCategories, reason: row.reasonCode })),
      source.rows.map((row) => ({ decision: row.reviewerDecision, primary: row.primaryCategory, secondary: row.secondaryCategories, reason: row.reasonCode })));
  } finally { clean(directory); }
});

test("T6L-6J-D training eligibility remains false", () => {
  const directory = temporaryDirectory(); try { assert.ok(createMhsCandidateAdmission(options(directory)).artifact.rows.every((row) => row.trainingEligible === false)); } finally { clean(directory); }
});

test("T6L-6J-D leaves the parent and legacy zero-byte candidate unchanged", () => {
  const parentBefore = shaFile(parentPath); const legacyBefore = shaFile(legacyCandidatePath); const directory = temporaryDirectory(); try { createMhsCandidateAdmission(options(directory));
    assert.equal(shaFile(parentPath), parentBefore); assert.equal(shaFile(legacyCandidatePath), legacyBefore); assert.equal(fs.statSync(legacyCandidatePath).size, 0);
  } finally { clean(directory); }
});

test("T6L-6J-D leaves the Reviewer A artifact unchanged", () => {
  const before = shaFile(reviewerPath); const directory = temporaryDirectory(); try { createMhsCandidateAdmission(options(directory)); assert.equal(shaFile(reviewerPath), before); } finally { clean(directory); }
});

test("T6L-6J-D leaves the resolution artifact unchanged", () => {
  const before = shaFile(resolutionPath); const directory = temporaryDirectory(); try { createMhsCandidateAdmission(options(directory)); assert.equal(shaFile(resolutionPath), before); } finally { clean(directory); }
});

test("T6L-6J-D candidate artifact refuses overwrite", () => {
  const directory = temporaryDirectory(); try { createMhsCandidateAdmission(options(directory)); assert.throws(() => createMhsCandidateAdmission(options(directory)), /already exists/); } finally { clean(directory); }
});

test("T6L-6J-D partial publication does not become authoritative", () => {
  const directory = temporaryDirectory(); try { assert.throws(() => createMhsCandidateAdmission({ ...options(directory), publishAtomic: () => { throw new Error("simulated publish failure"); } }), /simulated publish failure/);
    const output = path.join(directory, "candidates"); assert.equal(fs.existsSync(path.join(output, MHS_CANDIDATE_ARTIFACT_FILENAME)), false); assert.deepEqual(fs.existsSync(output) ? fs.readdirSync(output) : [], []);
  } finally { clean(directory); }
});

test("T6L-6J-D duplicate identities fail closed", () => {
  const directory = temporaryDirectory(); try { const artifact: any = createMhsCandidateAdmission(options(directory)).artifact; artifact.rows[1].sourceRowId = artifact.rows[0].sourceRowId;
    assert.throws(() => validateMhsCandidateAdmissionArtifact(artifact), /Duplicate/);
  } finally { clean(directory); }
});

test("T6L-6J-D has no second-review dependency", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsCandidateAdmission.ts"), "utf8");
  assert.doesNotMatch(source, /reviewerB\b|reviewer_b\b|reviewer b\b|second reviewer|peer reviewer|reconciliation/i);
});

test("T6L-6J-D summaries and admitted text bindings are deterministic", () => {
  const one = temporaryDirectory(); const two = temporaryDirectory(); try { const a = createMhsCandidateAdmission(options(one)).artifact; const b = createMhsCandidateAdmission(options(two)).artifact;
    assert.deepEqual(a.summary, b.summary); assert.equal(a.admittedCount + a.blockedCount, 100);
    assert.ok(a.rows.filter((row) => row.candidateAdmitted).every((row) => row.reviewedText !== null && crypto.createHash("sha256").update(row.reviewedText).digest("hex") === row.textDigest));
  } finally { clean(one); clean(two); }
});
