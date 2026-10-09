import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import { MhsPilotReviewImportArtifact, PersistedMhsPilotReview, validateMhsPilotReviewImportArtifact } from "../../research/textModerationDataset/mhsReviewImport";
import {
  createMhsReviewerAResolution, deriveMhsReviewResolutionRow, MHS_REVIEWER_A_ARTIFACT_SHA256,
  MHS_REVIEWER_A_PAYLOAD_DIGEST, MHS_REVIEWER_A_RESOLUTION_FILENAME, MHS_REVIEW_RESOLUTION_SCHEMA_VERSION,
  validateMhsReviewResolutionArtifact,
} from "../../research/textModerationDataset/mhsReviewResolution";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const sourcePath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-validated.json");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const candidatePath = path.join(root, "mhs-review-tranche-v1-public-reviewed-candidates.jsonl");
const shaBytes = (bytes: Buffer | string): string => crypto.createHash("sha256").update(bytes).digest("hex");
const shaFile = (filename: string): string => shaBytes(fs.readFileSync(filename));
const temporaryDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-resolution-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const options = (directory: string, sourceArtifactPath = sourcePath, parentTranchePath = parentPath) => ({
  sourceArtifactPath, parentTranchePath, outputDirectory: path.join(directory, "reviews"), generatedAt: "2026-09-11T10:00:00.000Z",
});
const imported = (): MhsPilotReviewImportArtifact => JSON.parse(fs.readFileSync(sourcePath, "utf8")) as MhsPilotReviewImportArtifact;
const synthetic = (decision: "ALLOW" | "BLOCK" | "NEEDS_ADJUDICATION" | "EXCLUDE", piiDisposition: "NONE" | "REQUIRES_REVIEW" | "EXCLUDE"): PersistedMhsPilotReview => {
  const item = JSON.parse(JSON.stringify(imported().reviews[0])) as any;
  item.piiDisposition = piiDisposition; item.review.decision = decision;
  item.review.primaryCategory = decision === "BLOCK" ? "PROFANITY" : null;
  item.review.secondaryCategories = [];
  item.review.reasonCode = decision === "ALLOW" ? "POLICY_ACCEPTABLE" : decision === "BLOCK" ? "DIRECT_PROFANITY" : decision === "EXCLUDE" ? "PII_OR_DATA_QUALITY" : "INSUFFICIENT_CONTEXT";
  return item as PersistedMhsPilotReview;
};

test("T6L-6J-C valid Reviewer A resolution succeeds", () => {
  const directory = temporaryDirectory(); try {
    const result = createMhsReviewerAResolution(options(directory));
    assert.equal(result.artifact.schemaVersion, MHS_REVIEW_RESOLUTION_SCHEMA_VERSION); assert.equal(result.artifact.rowCount, 100);
    assert.equal(shaFile(result.artifactPath), result.artifactSha256); assert.doesNotThrow(() => validateMhsReviewResolutionArtifact(JSON.parse(fs.readFileSync(result.artifactPath, "utf8"))));
  } finally { clean(directory); }
});

test("T6L-6J-C verifies the immutable source artifact SHA-256", () => {
  assert.equal(shaFile(sourcePath), MHS_REVIEWER_A_ARTIFACT_SHA256);
  const directory = temporaryDirectory(); try {
    const changed = path.join(directory, "changed.json"); fs.writeFileSync(changed, `${fs.readFileSync(sourcePath, "utf8")} `);
    assert.throws(() => createMhsReviewerAResolution(options(directory, changed)), /SHA-256 mismatch/);
  } finally { clean(directory); }
});

test("T6L-6J-C verifies the source canonical payload digest", () => {
  const artifact = imported(); const { payloadIntegrityDigest, ...payload } = artifact;
  assert.equal(payloadIntegrityDigest, MHS_REVIEWER_A_PAYLOAD_DIGEST); assert.equal(shaBytes(Buffer.from(canonicalJson(payload), "utf8")), MHS_REVIEWER_A_PAYLOAD_DIGEST);
  assert.doesNotThrow(() => validateMhsPilotReviewImportArtifact(artifact));
});

test("T6L-6J-C requires exactly 100 unique ordered rows", () => {
  const directory = temporaryDirectory(); try { const artifact = createMhsReviewerAResolution(options(directory)).artifact;
    assert.equal(artifact.rows.length, 100); assert.equal(new Set(artifact.rows.map((row) => row.sourceRowId)).size, 100);
    assert.deepEqual(artifact.rows.map((row) => row.pilotRowNumber), Array.from({ length: 100 }, (_, index) => index + 1));
  } finally { clean(directory); }
});

test("T6L-6J-C maps ALLOW to RESOLVED_ALLOW", () => assert.equal(deriveMhsReviewResolutionRow(synthetic("ALLOW", "NONE")).resolutionState, "RESOLVED_ALLOW"));
test("T6L-6J-C maps BLOCK to RESOLVED_BLOCK", () => assert.equal(deriveMhsReviewResolutionRow(synthetic("BLOCK", "NONE")).resolutionState, "RESOLVED_BLOCK"));
test("T6L-6J-C preserves BLOCK categories exactly", () => {
  for (const item of imported().reviews.filter((row) => row.review.decision === "BLOCK")) {
    const derived = deriveMhsReviewResolutionRow(item); assert.equal(derived.primaryCategory, item.review.primaryCategory); assert.deepEqual(derived.secondaryCategories, item.review.secondaryCategories);
  }
});
test("T6L-6J-C maps NEEDS_ADJUDICATION to unresolved", () => assert.equal(deriveMhsReviewResolutionRow(synthetic("NEEDS_ADJUDICATION", "NONE")).resolutionState, "UNRESOLVED_ADJUDICATION"));
test("T6L-6J-C maps EXCLUDE to excluded", () => assert.equal(deriveMhsReviewResolutionRow(synthetic("EXCLUDE", "NONE")).resolutionState, "EXCLUDED"));
test("T6L-6J-C maps PII NONE to PII_CLEAR", () => assert.equal(deriveMhsReviewResolutionRow(synthetic("ALLOW", "NONE")).piiGateState, "PII_CLEAR"));
test("T6L-6J-C maps PII REQUIRES_REVIEW to a progression blocker", () => {
  const row = deriveMhsReviewResolutionRow(synthetic("ALLOW", "REQUIRES_REVIEW")); assert.equal(row.piiGateState, "PII_REVIEW_REQUIRED"); assert.equal(row.progressionState, "RESOLVED_PII_BLOCKED"); assert.equal(row.candidateProgressionAllowed, false);
});
test("T6L-6J-C maps PII EXCLUDE to excluded", () => {
  const row = deriveMhsReviewResolutionRow(synthetic("ALLOW", "EXCLUDE")); assert.equal(row.piiGateState, "PII_EXCLUDED"); assert.equal(row.resolutionState, "EXCLUDED"); assert.equal(row.progressionState, "EXCLUDED");
});

test("T6L-6J-C creates no training eligibility", () => {
  const directory = temporaryDirectory(); try { assert.ok(createMhsReviewerAResolution(options(directory)).artifact.rows.every((row) => row.trainingEligible === false)); } finally { clean(directory); }
});
test("T6L-6J-C allows no candidate progression", () => {
  const directory = temporaryDirectory(); try { assert.ok(createMhsReviewerAResolution(options(directory)).artifact.rows.every((row) => row.candidateProgressionAllowed === false)); } finally { clean(directory); }
});

test("T6L-6J-C leaves the frozen parent unchanged", () => {
  const before = shaFile(parentPath); const directory = temporaryDirectory(); try { createMhsReviewerAResolution(options(directory)); assert.equal(shaFile(parentPath), before); } finally { clean(directory); }
});
test("T6L-6J-C leaves the Reviewer A import unchanged", () => {
  const before = shaFile(sourcePath); const directory = temporaryDirectory(); try { createMhsReviewerAResolution(options(directory)); assert.equal(shaFile(sourcePath), before); } finally { clean(directory); }
});
test("T6L-6J-C leaves the empty candidate output unchanged", () => {
  const before = shaFile(candidatePath); const directory = temporaryDirectory(); try { createMhsReviewerAResolution(options(directory)); assert.equal(shaFile(candidatePath), before); assert.equal(fs.statSync(candidatePath).size, 0); } finally { clean(directory); }
});

test("T6L-6J-C has no second-review dependency", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsReviewResolution.ts"), "utf8");
  assert.doesNotMatch(source, /reviewer[_ ]?b|second reviewer|reconciliation/i);
});
test("T6L-6J-C duplicate resolution replay fails closed", () => {
  const directory = temporaryDirectory(); try { createMhsReviewerAResolution(options(directory)); assert.throws(() => createMhsReviewerAResolution(options(directory)), /already exists/); } finally { clean(directory); }
});
test("T6L-6J-C partial publication failure leaves no artifact", () => {
  const directory = temporaryDirectory(); try {
    assert.throws(() => createMhsReviewerAResolution({ ...options(directory), publishAtomic: () => { throw new Error("simulated publish failure"); } }), /simulated publish failure/);
    const output = path.join(directory, "reviews"); assert.equal(fs.existsSync(path.join(output, MHS_REVIEWER_A_RESOLUTION_FILENAME)), false); assert.deepEqual(fs.existsSync(output) ? fs.readdirSync(output) : [], []);
  } finally { clean(directory); }
});

test("T6L-6J-C rejects duplicate rows and altered derived semantics", () => {
  const directory = temporaryDirectory(); try { const artifact = createMhsReviewerAResolution(options(directory)).artifact;
    const duplicate = JSON.parse(JSON.stringify(artifact)); duplicate.rows[1].sourceRowId = duplicate.rows[0].sourceRowId;
    assert.throws(() => validateMhsReviewResolutionArtifact(duplicate), /Duplicate/);
    const altered = JSON.parse(JSON.stringify(artifact)); altered.rows[0].piiGateState = "PII_CLEAR" === altered.rows[0].piiGateState ? "PII_REVIEW_REQUIRED" : "PII_CLEAR";
    assert.throws(() => validateMhsReviewResolutionArtifact(altered), /Invalid derived states/);
  } finally { clean(directory); }
});

test("T6L-6J-C summary is complete and deterministic", () => {
  const one = temporaryDirectory(); const two = temporaryDirectory(); try {
    const a = createMhsReviewerAResolution(options(one)).artifact; const b = createMhsReviewerAResolution(options(two)).artifact;
    assert.deepEqual(a.summary, b.summary); assert.equal(Object.values(a.summary.decisionCounts).reduce((sum, count) => sum + count, 0), 100);
    assert.equal(Object.values(a.summary.piiDispositionCounts).reduce((sum, count) => sum + count, 0), 100);
    assert.equal(a.summary.candidateProgressionAllowed, 0); assert.equal(a.summary.trainingEligible, 0);
  } finally { clean(one); clean(two); }
});
