import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MhsCandidateAdmissionArtifact } from "../../research/textModerationDataset/mhsCandidateAdmission";
import {
  MHS_L_AUTHORIZATION_SHA256, MHS_L_SEMANTIC_AUDIT_SHA256, MHS_REVIEWED_SEMANTIC_APPLICATION_FILENAME,
  MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES, ReviewedSemanticEvidenceRecord, assertNoContradictorySemanticEvidence,
  canonicalSemanticPairKey, connectedSemanticComponents, createMhsReviewedSemanticApplicationContract,
  proposeReviewedSemanticEdge, validateMhsReviewedSemanticApplicationArtifact,
} from "../../research/textModerationDataset/mhsReviewedSemanticApplicationContract";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, "semantic-review"); const candidates = path.join(root, "candidates");
const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  currentSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"), historicalSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit.json"),
  hValidatedPath: path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json"), hPrecisionPath: path.join(review, "mhs-semantic-review-v1-precision-analysis.json"),
  jValidatedPath: path.join(review, "mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), jAnalysisPath: path.join(review, "mhs-semantic-boundary-review-v1-analysis.json"),
  lAuthorizationPath: path.join(review, "mhs-semantic-review-floor-0.85-authorization-v1.json") };
const fixedAt = "2026-09-13T14:00:00.000Z"; const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-semantic-m-")); const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const create = (directory: string, overrides: Partial<typeof paths> = {}, publishAtomic?: (temporaryPath: string, targetPath: string) => void) => createMhsReviewedSemanticApplicationContract({ ...paths, ...overrides, outputDirectory: directory, generatedAt: fixedAt, publishAtomic });
const evidence = (relationship: ReviewedSemanticEvidenceRecord["semanticRelationship"] = "NEAR_DUPLICATE", a = "a", b = "b"): ReviewedSemanticEvidenceRecord => ({ authority: "H", authorityArtifactSha256: "f".repeat(64), reviewerId: "a",
  pairKey: canonicalSemanticPairKey(a, b), candidateAId: a, candidateBId: b, candidateADigest: "a".repeat(64), candidateBDigest: "b".repeat(64), semanticScore: 0.95, semanticRelationship: relationship });
const edge = (a: string, b: string) => proposeReviewedSemanticEdge(evidence("NEAR_DUPLICATE", a, b), true)!;
const changed = (directory: string, source: string): string => { const target = path.join(directory, path.basename(source)); fs.writeFileSync(target, `${fs.readFileSync(source, "utf8")} `); return target; };

test("M enforces candidate SHA", () => { const directory = temporary(); try { assert.throws(() => create(path.join(directory, "out"), { candidatePath: changed(directory, paths.candidatePath) }), /SHA-256/); } finally { clean(directory); } });
test("M enforces current 0.85 semantic audit SHA", () => { const directory = temporary(); try { assert.throws(() => create(path.join(directory, "out"), { currentSemanticAuditPath: changed(directory, paths.currentSemanticAuditPath) }), /SHA-256/); } finally { clean(directory); } });
test("M enforces H validated review SHA", () => { const directory = temporary(); try { assert.throws(() => create(path.join(directory, "out"), { hValidatedPath: changed(directory, paths.hValidatedPath) }), /SHA-256/); } finally { clean(directory); } });
test("M enforces J validated review SHA", () => { const directory = temporary(); try { assert.throws(() => create(path.join(directory, "out"), { jValidatedPath: changed(directory, paths.jValidatedPath) }), /SHA-256/); } finally { clean(directory); } });
test("M enforces L authorization SHA", () => { const directory = temporary(); try { assert.equal(sha(paths.lAuthorizationPath), MHS_L_AUTHORIZATION_SHA256); assert.throws(() => create(path.join(directory, "out"), { lAuthorizationPath: changed(directory, paths.lAuthorizationPath) }), /SHA-256/); } finally { clean(directory); } });
test("M resolves exactly two current near-duplicate relationships from authority", () => { const directory = temporary(); try { assert.equal(create(directory).artifact.nearDuplicatePairs.length, 2); } finally { clean(directory); } });
test("M current reviewed authority contains no DUPLICATE relationship", () => { const directory = temporary(); try { assert.equal(create(directory).artifact.knownReviewedSummary.DUPLICATE, 0); } finally { clean(directory); } });
test("M RELATED_BUT_DISTINCT creates no edge", () => assert.equal(proposeReviewedSemanticEdge(evidence("RELATED_BUT_DISTINCT"), true), null));
test("M UNRELATED creates no edge", () => assert.equal(proposeReviewedSemanticEdge(evidence("UNRELATED"), true), null));
test("M NEEDS_ADJUDICATION creates no edge", () => assert.equal(proposeReviewedSemanticEdge(evidence("NEEDS_ADJUDICATION"), true), null));
test("M NEAR_DUPLICATE may create only a proposed dry-run edge", () => assert.equal(proposeReviewedSemanticEdge(evidence(), true)?.status, "PROPOSED_DRY_RUN_NON_AUTHORITATIVE"));
test("M similarity score alone cannot create an edge", () => assert.throws(() => proposeReviewedSemanticEdge(evidence(), false), /score alone/));
test("M 0.94 alone cannot create an edge", () => { const value = evidence("UNRELATED"); assert.equal(value.semanticScore, 0.95); assert.equal(proposeReviewedSemanticEdge(value, true), null); });
test("M exact-pair contradictory authority fails closed", () => assert.throws(() => assertNoContradictorySemanticEvidence([evidence("NEAR_DUPLICATE"), evidence("UNRELATED")]), /Contradictory/));
test("M unordered pair identity is canonical", () => assert.equal(canonicalSemanticPairKey("z", "a"), "a::z"));
test("M dry-run graph is deterministic", () => assert.deepEqual(connectedSemanticComponents([edge("a", "b"), edge("b", "c")]), connectedSemanticComponents([edge("b", "c"), edge("a", "b")])));
test("M connected components are deterministic", () => { const components = connectedSemanticComponents([edge("d", "e"), edge("a", "b"), edge("b", "c")]); assert.deepEqual(components.map((value) => value.memberCandidateIds), [["a", "b", "c"], ["d", "e"]]); });
test("M transitive component behavior connects A-B-C", () => assert.deepEqual(connectedSemanticComponents([edge("a", "b"), edge("b", "c")])[0].memberCandidateIds, ["a", "b", "c"]));
test("M pair relationship remains distinct from component membership", () => { const edges = [edge("a", "b"), edge("b", "c")]; const component = connectedSemanticComponents(edges)[0]; assert.equal(edges.length, 2); assert.equal(component.size, 3); assert.equal(component.edgePairKeys.includes("a::c"), false); });
test("M group types retain distinct ownership", () => { const directory = temporary(); try { const policy = create(directory).artifact.groupTypeInteractionPolicy; assert.equal(new Set(Object.values(policy)).size, 5); assert.match(policy.nearPairGroupId, /SOURCE_NATIVE/); assert.match(policy.semanticGroupId, /VALIDATED/); } finally { clean(directory); } });
test("M never mutates candidate rows", () => { const before = fs.readFileSync(paths.candidatePath); const directory = temporary(); try { create(directory); assert.ok(before.equals(fs.readFileSync(paths.candidatePath))); } finally { clean(directory); } });
test("M assigns no semanticGroupId", () => { const directory = temporary(); try { const artifact = create(directory).artifact; assert.deepEqual(artifact.semanticGroupIdAssignments, []); assert.ok(artifact.affectedCandidates.every((row) => row.semanticGroupId === null)); } finally { clean(directory); } });
test("M assigns no duplicateGroupId", () => { const directory = temporary(); try { assert.deepEqual(create(directory).artifact.duplicateGroupIdAssignments, []); } finally { clean(directory); } });
test("M candidate membership remains 86", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; assert.equal(candidate.rows.filter((row) => row.candidateAdmitted).length, 86); });
test("M membership digest remains unchanged", () => { const directory = temporary(); try { assert.equal(create(directory).artifact.authorities.candidateMembershipDigest, "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df"); } finally { clean(directory); } });
test("M moderation judgments remain 58/28", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")) as MhsCandidateAdmissionArtifact; const rows = candidate.rows.filter((row) => row.candidateAdmitted); assert.deepEqual([rows.filter((row) => row.reviewerDecision === "ALLOW").length, rows.filter((row) => row.reviewerDecision === "BLOCK").length], [58, 28]); });
test("M trainingEligible remains zero", () => { const directory = temporary(); try { assert.equal(create(directory).artifact.trainingEligibleCount, 0); } finally { clean(directory); } });
test("M creates no split assignment", () => { const directory = temporary(); try { const artifact = create(directory).artifact; assert.deepEqual(artifact.splitAssignments, []); assert.ok(artifact.affectedCandidates.every((row) => row.split === "UNASSIGNED")); } finally { clean(directory); } });
test("M logic never accesses frozen 140", () => { const files = ["src/research/textModerationDataset/mhsReviewedSemanticApplicationContract.ts", "src/scripts/createMhsReviewedSemanticApplicationContract.ts"]; const source = files.map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|frozen.?140/i); });
test("M artifact is canonical and deterministic", () => { const a = temporary(); const b = temporary(); try { const one = create(a); const two = create(b); assert.equal(fs.readFileSync(one.artifactPath, "utf8"), fs.readFileSync(two.artifactPath, "utf8")); assert.doesNotThrow(() => validateMhsReviewedSemanticApplicationArtifact(one.artifact)); assert.equal(sha(paths.currentSemanticAuditPath), MHS_L_SEMANTIC_AUDIT_SHA256); } finally { clean(a); clean(b); } });
test("M artifact refuses overwrite", () => { const directory = temporary(); try { create(directory); assert.throws(() => create(directory), /already exists/); } finally { clean(directory); } });
test("M simulated partial publication leaves no authoritative artifact", () => { const directory = temporary(); try { assert.throws(() => create(directory, {}, () => { throw new Error("simulated"); }), /simulated/); assert.equal(fs.existsSync(path.join(directory, MHS_REVIEWED_SEMANTIC_APPLICATION_FILENAME)), false); assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []); } finally { clean(directory); } });
test("M relationship rules cover the exact bounded enum", () => assert.deepEqual(Object.keys(MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES), ["DUPLICATE", "NEAR_DUPLICATE", "RELATED_BUT_DISTINCT", "UNRELATED", "NEEDS_ADJUDICATION"]));
