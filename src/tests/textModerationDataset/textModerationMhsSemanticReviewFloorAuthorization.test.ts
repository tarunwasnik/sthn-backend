import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import { E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD, MhsSemanticAuditArtifact } from "../../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_K_ANALYSIS_SHA256, MHS_K_VALIDATED_SHA256, MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME,
  MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME, createMhsSemanticReviewFloorAuthorization,
  validateMhsReviewFloorAuthorizationArtifact, validateMhsReviewFloorSemanticAuditArtifact,
} from "../../research/textModerationDataset/mhsSemanticReviewFloorAuthorization";
import {
  STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL, STHN_SEMANTIC_INVESTIGATION_BOUNDARY,
  STHN_SEMANTIC_PREVIOUS_REVIEW_FLOOR, STHN_SEMANTIC_REVIEW_FLOOR,
} from "../../research/textModerationDataset/semanticReviewPolicy";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, "semantic-review"); const candidates = path.join(root, "candidates");
const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), semanticPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit.json"),
  hValidatedPath: path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json"), hPrecisionPath: path.join(review, "mhs-semantic-review-v1-precision-analysis.json"),
  jValidatedPath: path.join(review, "mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), jAnalysisPath: path.join(review, "mhs-semantic-boundary-review-v1-analysis.json"),
  jCompletedPath: path.join(review, "mhs-semantic-boundary-review-v1-completed-reviewer-a.csv"), jManifestPath: path.join(review, "mhs-semantic-boundary-review-v1-internal-manifest.json") };
const fixedAt = "2026-09-13T12:00:00.000Z"; const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-floor-l-")); const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const create = (directory: string, publishAtomic?: (temporaryPath: string, targetPath: string) => void) => createMhsSemanticReviewFloorAuthorization({ ...paths,
  candidateOutputDirectory: path.join(directory, "candidates"), reviewOutputDirectory: path.join(directory, "review"), generatedAt: fixedAt, publishAtomic });

test("L detects the historical authoritative review floor as 0.80", () => assert.equal(E5_SEMANTIC_NEAR_DUPLICATE_THRESHOLD, 0.8));
test("L proposed replay uses 0.85", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.proposedContractImpact.reviewFloor, 0.85); } finally { clean(directory); } });
test("L candidate membership remains exactly 86", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; assert.equal(candidate.rows.filter((row) => row.candidateAdmitted).length, 86); });
test("L candidate membership digest remains unchanged", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.candidateMembershipDigest, "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df"); } finally { clean(directory); } });
test("L candidate artifact remains byte-identical", () => { const before = fs.readFileSync(paths.candidatePath); const directory = temporary(); try { create(directory); assert.ok(before.equals(fs.readFileSync(paths.candidatePath))); } finally { clean(directory); } });
test("L source moderation judgments remain 58 ALLOW and 28 BLOCK", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; const rows = candidate.rows.filter((row) => row.candidateAdmitted); assert.equal(rows.filter((row) => row.reviewerDecision === "ALLOW").length, 58); assert.equal(rows.filter((row) => row.reviewerDecision === "BLOCK").length, 28); });
test("L H validated artifact remains immutable", () => assert.equal(sha(paths.hValidatedPath), "be9b5e86884d91f85438c83d400a8d0b67a562b8ed798ff5d93c6a6cb5f2685b"));
test("L J validated artifact remains immutable", () => assert.equal(sha(paths.jValidatedPath), MHS_K_VALIDATED_SHA256));
test("L H/J overlap remains zero", () => { const directory = temporary(); try { const result = create(directory).authorization.humanEvidence; assert.equal(result.retained.hCount + result.excluded.hCount, 150); assert.equal(result.retained.jCount + result.excluded.jCount, 75); } finally { clean(directory); } });
test("L combined human-reviewed count is 225", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.reviewedHPlusJCount, 225); } finally { clean(directory); } });
test("L known duplicate-like count is two", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.humanEvidence.duplicateLikeTotal, 2); } finally { clean(directory); } });
test("L retains both known near-duplicates at or above 0.85", () => { const directory = temporary(); try { const retained = create(directory).authorization.humanEvidence.retained; assert.equal(retained.outcomeCounts.NEAR_DUPLICATE, 2); assert.equal(retained.duplicateLikeCount, 2); } finally { clean(directory); } });
test("L loses zero known duplicate-like findings", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.humanEvidence.duplicateLikeLost, 0); } finally { clean(directory); } });
test("L places 206 reviewed H/J pairs below 0.85", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.humanEvidence.excluded.reviewedCount, 206); } finally { clean(directory); } });
test("L all 206 excluded reviewed pairs are non-duplicate-like", () => { const directory = temporary(); try { const value = create(directory).authorization.humanEvidence.excluded; assert.equal(value.duplicateLikeCount, 0); assert.equal(value.outcomeCounts.RELATED_BUT_DISTINCT + value.outcomeCounts.UNRELATED, 206); } finally { clean(directory); } });
test("L computes ALLOW/BLOCK impact deterministically", () => { const a = temporary(); const b = temporary(); try { assert.deepEqual(create(a).authorization.allowBlockImpact, create(b).authorization.allowBlockImpact); assert.deepEqual(create(temporarySafe(a)).authorization.allowBlockImpact, { allSemanticSignalsCurrent: 543, allSemanticSignalsProposed: 5, allSemanticSignalsExcluded: 538, reviewedCurrent: 75, reviewedRetained: 5, reviewedExcluded: 70, reviewedExcludedDuplicateLike: 0 }); } finally { clean(a); clean(b); } });
function temporarySafe(parent: string): string { return path.join(parent, "extra"); }
test("L changes no moderation threshold", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.productionCouplingVerification.moderationThresholdChanged, false); } finally { clean(directory); } });
test("L investigation boundary remains 0.85", () => assert.equal(STHN_SEMANTIC_INVESTIGATION_BOUNDARY, 0.85));
test("L high-confidence signal remains 0.94", () => { assert.equal(E5_SEMANTIC_HIGH_CONFIDENCE_THRESHOLD, 0.94); assert.equal(STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL, 0.94); });
test("L applies no semanticGroupId", () => { const directory = temporary(); try { const result = create(directory); assert.equal(result.authorization.candidateMutationVerification.semanticGroupIdApplied, false); assert.ok(result.semanticAudit.findings.every((row) => !("semanticGroupId" in row))); } finally { clean(directory); } });
test("L merges no candidates", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.candidateMutationVerification.candidatesMerged, false); } finally { clean(directory); } });
test("L removes no candidates", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.candidateMutationVerification.candidatesRemoved, false); } finally { clean(directory); } });
test("L preserves every retained semantic score", () => { const source = JSON.parse(fs.readFileSync(paths.semanticPath, "utf8")) as MhsSemanticAuditArtifact; const expected = source.findings.filter((row) => row.similarity >= 0.85).map((row) => [row.candidateAId, row.candidateBId, row.similarity]); const directory = temporary(); try { assert.deepEqual(create(directory).semanticAudit.findings.map((row) => [row.candidateAId, row.candidateBId, row.similarity]), expected); } finally { clean(directory); } });
test("L keeps training eligibility at zero", () => { const directory = temporary(); try { assert.equal(create(directory).authorization.candidateMutationVerification.trainingEligibleCount, 0); } finally { clean(directory); } });
test("L does not use frozen 140 as threshold evidence", () => { const files = ["src/research/textModerationDataset/semanticReviewPolicy.ts", "src/research/textModerationDataset/mhsSemanticReviewFloorAuthorization.ts", "src/scripts/createMhsSemanticReviewFloorAuthorization.ts"]; const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|frozen.?140/i); });
test("L authorization artifacts are canonical and deterministic", () => { const a = temporary(); const b = temporary(); try { const one = create(a); const two = create(b); assert.equal(fs.readFileSync(one.authorizationPath, "utf8"), fs.readFileSync(two.authorizationPath, "utf8")); assert.equal(fs.readFileSync(one.semanticAuditPath, "utf8"), fs.readFileSync(two.semanticAuditPath, "utf8")); assert.doesNotThrow(() => validateMhsReviewFloorAuthorizationArtifact(one.authorization)); assert.doesNotThrow(() => validateMhsReviewFloorSemanticAuditArtifact(one.semanticAudit)); } finally { clean(a); clean(b); } });
test("L authorization artifacts refuse overwrite", () => { const directory = temporary(); try { create(directory); assert.throws(() => create(directory), /already exists/); } finally { clean(directory); } });
test("L simulated partial publication leaves neither authoritative artifact", () => { const directory = temporary(); let calls = 0; const publisher = (temporaryPath: string, targetPath: string): void => { calls += 1; if (calls === 2) throw new Error("simulated second publication failure"); fs.renameSync(temporaryPath, targetPath); }; try { assert.throws(() => create(directory, publisher), /simulated/); assert.equal(fs.existsSync(path.join(directory, "candidates", MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME)), false); assert.equal(fs.existsSync(path.join(directory, "review", MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME)), false); } finally { clean(directory); } });
test("L historical semantic and H/J artifacts remain unchanged", () => { assert.equal(sha(paths.semanticPath), "aa3d24ebba90d6ea7eb0a8f491ceb7b0e8e98c6f08c7e865701dbde6f591a998"); assert.equal(sha(paths.hValidatedPath), "be9b5e86884d91f85438c83d400a8d0b67a562b8ed798ff5d93c6a6cb5f2685b"); assert.equal(sha(paths.jValidatedPath), MHS_K_VALIDATED_SHA256); assert.equal(sha(paths.jAnalysisPath), MHS_K_ANALYSIS_SHA256); });
test("L final canonical review floor is 0.85 after authorization checks", () => { assert.equal(STHN_SEMANTIC_PREVIOUS_REVIEW_FLOOR, 0.8); assert.equal(STHN_SEMANTIC_REVIEW_FLOOR, 0.85); });
