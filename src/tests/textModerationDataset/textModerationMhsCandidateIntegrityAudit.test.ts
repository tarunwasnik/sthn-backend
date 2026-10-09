import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import {
  buildMhsDuplicateAuditGroups, createMhsCandidateIntegrityAudit, MHS_AUDITED_CANDIDATE_COUNT, MHS_CANDIDATE_ARTIFACT_SHA256,
  MHS_CANDIDATE_AUDIT_FILENAME, MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION, MHS_CANDIDATE_PAYLOAD_DIGEST,
  MHS_CONTAMINATION_AUDIT_STATUS, MHS_SEMANTIC_AUDIT_STATUS, MhsCandidateIntegrityAuditRow, validateMhsCandidateIntegrityAuditArtifact,
} from "../../research/textModerationDataset/mhsCandidateIntegrityAudit";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const candidatePath = path.join(root, "candidates", "mhs-review-pilot-v1-candidate-v1.json");
const resolutionPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-resolution.json");
const reviewerPath = path.join(root, "reviews", "mhs-review-pilot-v1-reviewer-a-validated.json");
const parentPath = path.join(root, "mhs-review-tranche-v1.jsonl");
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const temporaryDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-integrity-audit-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const options = (directory: string, candidateArtifactPath = candidatePath) => ({ candidateArtifactPath, resolutionArtifactPath: resolutionPath,
  reviewerArtifactPath: reviewerPath, parentTranchePath: parentPath, outputDirectory: path.join(directory, "candidates"), generatedAt: "2026-09-11T14:00:00.000Z" });
const candidate = (): MhsCandidateAdmissionArtifact => JSON.parse(fs.readFileSync(candidatePath, "utf8")) as MhsCandidateAdmissionArtifact;
const sampleAuditRow = (overrides: Partial<MhsCandidateIntegrityAuditRow> = {}): MhsCandidateIntegrityAuditRow => ({
  pilotRowNumber: 1, sourceRowId: "source-1", commentId: "comment-1", textDigest: "a".repeat(64), exactTextDigest: "a".repeat(64),
  normalizedFingerprint: "b".repeat(64), exactDuplicateGroupId: "exact-group", normalizedDuplicateGroupId: "normalized-group", lineageRootId: "lineage-1",
  lineageGroupId: null, transformationCount: 0, sourceId: "MEASURING_HATE_SPEECH", sourceVersion: "v", sourceRevision: "r", sourceLicense: "LICENSE.CC_BY_4_0",
  language: "en", script: "LATIN", sourceScoreBand: "MIDDLE_SCORE", targetIdentityFamilies: [], reviewerDecision: "ALLOW", primaryCategory: null,
  secondaryCategories: [], reasonCode: "POLICY_ACCEPTABLE", candidateState: "ADMITTED_ALLOW", candidateAdmitted: true, trainingEligible: false, ...overrides,
});

test("T6L-6J-E valid candidate artifact loads and audits", () => {
  const directory = temporaryDirectory(); try { const result = createMhsCandidateIntegrityAudit(options(directory));
    assert.equal(result.artifact.schemaVersion, MHS_CANDIDATE_INTEGRITY_AUDIT_SCHEMA_VERSION); assert.equal(result.artifact.admittedRowCount, 86);
    assert.equal(shaFile(result.artifactPath), result.artifactSha256); assert.doesNotThrow(() => validateMhsCandidateIntegrityAuditArtifact(JSON.parse(fs.readFileSync(result.artifactPath, "utf8"))));
  } finally { clean(directory); }
});

test("T6L-6J-E candidate SHA is verified", () => {
  assert.equal(shaFile(candidatePath), MHS_CANDIDATE_ARTIFACT_SHA256); const directory = temporaryDirectory(); try { const changed = path.join(directory, "candidate.json"); fs.writeFileSync(changed, `${fs.readFileSync(candidatePath, "utf8")} `);
    assert.throws(() => createMhsCandidateIntegrityAudit(options(directory, changed)), /Artifact SHA-256 mismatch/);
  } finally { clean(directory); }
});

test("T6L-6J-E candidate payload digest is verified", () => { const artifact = candidate(); assert.equal(artifact.candidatePayloadDigest, MHS_CANDIDATE_PAYLOAD_DIGEST); assert.doesNotThrow(() => validateMhsCandidateAdmissionArtifact(artifact)); });

test("T6L-6J-E audits exactly 86 admitted rows", () => { const directory = temporaryDirectory(); try { const artifact = createMhsCandidateIntegrityAudit(options(directory)).artifact; assert.equal(artifact.rows.length, MHS_AUDITED_CANDIDATE_COUNT); assert.ok(artifact.rows.every((row) => row.candidateAdmitted)); } finally { clean(directory); } });

test("T6L-6J-E excludes all blocked rows from membership", () => { const directory = temporaryDirectory(); try { const artifact = createMhsCandidateIntegrityAudit(options(directory)).artifact; const blockedIds = new Set(candidate().rows.filter((row) => !row.candidateAdmitted).map((row) => row.sourceRowId)); assert.equal(artifact.rows.filter((row) => blockedIds.has(row.sourceRowId)).length, 0); } finally { clean(directory); } });

test("T6L-6J-E exact duplicate grouping is deterministic", () => { const rows = [sampleAuditRow(), sampleAuditRow({ pilotRowNumber: 2, sourceRowId: "source-2", commentId: "comment-2" })]; assert.deepEqual(buildMhsDuplicateAuditGroups(rows, "exact"), buildMhsDuplicateAuditGroups([...rows].reverse(), "exact")); });

test("T6L-6J-E normalized duplicate grouping is deterministic", () => { const rows = [sampleAuditRow({ exactTextDigest: "1".repeat(64) }), sampleAuditRow({ pilotRowNumber: 2, sourceRowId: "source-2", commentId: "comment-2", exactTextDigest: "2".repeat(64) })]; assert.deepEqual(buildMhsDuplicateAuditGroups(rows, "normalized"), buildMhsDuplicateAuditGroups([...rows].reverse(), "normalized")); });

test("T6L-6J-E conflicting exact labels are flagged", () => { const rows = [sampleAuditRow(), sampleAuditRow({ pilotRowNumber: 2, sourceRowId: "source-2", commentId: "comment-2", reviewerDecision: "BLOCK", primaryCategory: "HATE", candidateState: "ADMITTED_BLOCK" })]; assert.equal(buildMhsDuplicateAuditGroups(rows, "exact")[0].conflictFlag, "LABEL_CONFLICT_EXACT_DUPLICATE"); });

test("T6L-6J-E conflicting normalized labels are flagged", () => { const rows = [sampleAuditRow({ exactTextDigest: "1".repeat(64) }), sampleAuditRow({ pilotRowNumber: 2, sourceRowId: "source-2", commentId: "comment-2", exactTextDigest: "2".repeat(64), reviewerDecision: "BLOCK", primaryCategory: "HATE", candidateState: "ADMITTED_BLOCK" })]; assert.equal(buildMhsDuplicateAuditGroups(rows, "normalized")[0].conflictFlag, "LABEL_CONFLICT_NORMALIZED_DUPLICATE"); });

test("T6L-6J-E original candidate text remains unchanged and is not copied into audit rows", () => { const before = shaFile(candidatePath); const directory = temporaryDirectory(); try { const artifact: any = createMhsCandidateIntegrityAudit(options(directory)).artifact; assert.equal(shaFile(candidatePath), before); assert.ok(artifact.rows.every((row: any) => !Object.prototype.hasOwnProperty.call(row, "reviewedText") && !Object.prototype.hasOwnProperty.call(row, "text"))); } finally { clean(directory); } });

test("T6L-6J-E human decisions remain unchanged", () => { const directory = temporaryDirectory(); try { const artifact = createMhsCandidateIntegrityAudit(options(directory)).artifact; const admitted = candidate().rows.filter((row) => row.candidateAdmitted); assert.deepEqual(artifact.rows.map((row) => row.reviewerDecision), admitted.map((row) => row.reviewerDecision)); } finally { clean(directory); } });

test("T6L-6J-E candidate states remain unchanged", () => { const directory = temporaryDirectory(); try { const artifact = createMhsCandidateIntegrityAudit(options(directory)).artifact; const admitted = candidate().rows.filter((row) => row.candidateAdmitted); assert.deepEqual(artifact.rows.map((row) => row.candidateState), admitted.map((row) => row.candidateState)); } finally { clean(directory); } });

test("T6L-6J-E trainingEligible remains false", () => { const directory = temporaryDirectory(); try { assert.ok(createMhsCandidateIntegrityAudit(options(directory)).artifact.rows.every((row) => row.trainingEligible === false)); } finally { clean(directory); } });

test("T6L-6J-E lineage grouping is deterministic", () => { const one = temporaryDirectory(); const two = temporaryDirectory(); try { const a = createMhsCandidateIntegrityAudit(options(one)).artifact; const b = createMhsCandidateIntegrityAudit(options(two)).artifact; assert.deepEqual(a.lineageAudit, b.lineageAudit); assert.deepEqual(a.rows.map((row) => row.lineageGroupId), b.rows.map((row) => row.lineageGroupId)); } finally { clean(one); clean(two); } });

test("T6L-6J-E semantic audit is deferred without authorized tooling", () => { const directory = temporaryDirectory(); try { const semantic = createMhsCandidateIntegrityAudit(options(directory)).artifact.semanticAudit; assert.equal(semantic.status, MHS_SEMANTIC_AUDIT_STATUS); assert.equal(semantic.detectorAvailable, false); assert.equal(semantic.groupCount, 0); } finally { clean(directory); } });

test("T6L-6J-E frozen benchmark boundary cannot be bypassed", () => { const source = fs.readFileSync(path.resolve(process.cwd(), "src", "research", "textModerationDataset", "mhsCandidateIntegrityAudit.ts"), "utf8"); assert.doesNotMatch(source, /from ["'].*textModerationFixtures|fixtures\/text-moderation|STHN_TEXT_MODERATION_FIXTURES_V1R/); });

test("T6L-6J-E contamination report copies no benchmark text", () => { const directory = temporaryDirectory(); try { const report = createMhsCandidateIntegrityAudit(options(directory)).artifact.contaminationAudit; assert.equal(report.status, MHS_CONTAMINATION_AUDIT_STATUS); assert.equal(report.protectedInterfaceAvailable, false); assert.equal(report.findingsCount, 0); assert.equal(report.copiedBenchmarkText, false); assert.deepEqual(report.findings, []); } finally { clean(directory); } });

test("T6L-6J-E parent tranche remains unchanged", () => { const before = shaFile(parentPath); const directory = temporaryDirectory(); try { createMhsCandidateIntegrityAudit(options(directory)); assert.equal(shaFile(parentPath), before); } finally { clean(directory); } });
test("T6L-6J-E Reviewer A artifact remains unchanged", () => { const before = shaFile(reviewerPath); const directory = temporaryDirectory(); try { createMhsCandidateIntegrityAudit(options(directory)); assert.equal(shaFile(reviewerPath), before); } finally { clean(directory); } });
test("T6L-6J-E resolution artifact remains unchanged", () => { const before = shaFile(resolutionPath); const directory = temporaryDirectory(); try { createMhsCandidateIntegrityAudit(options(directory)); assert.equal(shaFile(resolutionPath), before); } finally { clean(directory); } });
test("T6L-6J-E candidate artifact remains unchanged", () => { const before = shaFile(candidatePath); const directory = temporaryDirectory(); try { createMhsCandidateIntegrityAudit(options(directory)); assert.equal(shaFile(candidatePath), before); } finally { clean(directory); } });

test("T6L-6J-E audit artifact refuses overwrite", () => { const directory = temporaryDirectory(); try { createMhsCandidateIntegrityAudit(options(directory)); assert.throws(() => createMhsCandidateIntegrityAudit(options(directory)), /already exists/); } finally { clean(directory); } });

test("T6L-6J-E partial publication cannot become authoritative", () => { const directory = temporaryDirectory(); try { assert.throws(() => createMhsCandidateIntegrityAudit({ ...options(directory), publishAtomic: () => { throw new Error("simulated publish failure"); } }), /simulated publish failure/); const output = path.join(directory, "candidates"); assert.equal(fs.existsSync(path.join(output, MHS_CANDIDATE_AUDIT_FILENAME)), false); assert.deepEqual(fs.existsSync(output) ? fs.readdirSync(output) : [], []); } finally { clean(directory); } });
