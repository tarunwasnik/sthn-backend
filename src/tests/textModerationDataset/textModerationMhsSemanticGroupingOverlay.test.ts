import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MHS_CANDIDATE_MEMBERSHIP_DIGEST, MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256, MHS_SEMANTIC_GROUPING_OVERLAY_FILENAME,
  MHS_SEMANTIC_GROUPING_OVERLAY_POLICY, MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA, MHS_SEMANTIC_GROUPING_OVERLAY_VERSION, MhsSemanticGroupingOverlayArtifact,
  authoritativeSemanticEdgeId, authorizeReviewedSemanticEdge, createMhsSemanticGroupingOverlay, deriveAuthoritativeSemanticComponents, stableSemanticGroupId, validateMhsSemanticGroupingOverlayArtifact,
} from "../../research/textModerationDataset/mhsSemanticGroupingOverlay";
import { ReviewedSemanticEvidenceRecord, assertNoContradictorySemanticEvidence, canonicalSemanticPairKey } from "../../research/textModerationDataset/mhsReviewedSemanticApplicationContract";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, "semantic-review"); const candidates = path.join(root, "candidates");
const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  currentSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"), hValidatedPath: path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json"),
  jValidatedPath: path.join(review, "mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), lAuthorizationPath: path.join(review, "mhs-semantic-review-floor-0.85-authorization-v1.json"),
  mApplicationContractPath: path.join(review, "mhs-reviewed-semantic-application-contract-v1.json") };
const fixedAt = "2026-09-13T15:00:00.000Z"; const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-semantic-n-")); const clean = (d: string): void => fs.rmSync(d, { recursive: true, force: true });
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const create = (directory: string, overrides: Partial<typeof paths> = {}, publishAtomic?: (temporaryPath: string, targetPath: string) => void) => createMhsSemanticGroupingOverlay({ ...paths, ...overrides, outputDirectory: directory, generatedAt: fixedAt, publishAtomic });
const changed = (directory: string, source: string): string => { const target = path.join(directory, path.basename(source)); fs.writeFileSync(target, `${fs.readFileSync(source, "utf8")} `); return target; };
const withArtifact = (fn: (artifact: MhsSemanticGroupingOverlayArtifact) => void): void => { const d = temporary(); try { fn(create(d).artifact); } finally { clean(d); } };
const clone = (value: MhsSemanticGroupingOverlayArtifact): any => JSON.parse(JSON.stringify(value));
const evidence = (relationship: ReviewedSemanticEvidenceRecord["semanticRelationship"] = "NEAR_DUPLICATE", score = 0.95): ReviewedSemanticEvidenceRecord => ({ authority: "H", authorityArtifactSha256: "be9b5e86884d91f85438c83d400a8d0b67a562b8ed798ff5d93c6a6cb5f2685b",
  reviewerId: "a", pairKey: "a::b", candidateAId: "a", candidateBId: "b", candidateADigest: "a".repeat(64), candidateBDigest: "b".repeat(64), semanticScore: score, semanticRelationship: relationship });

test("N publishes the versioned schema", () => withArtifact((a) => assert.equal(a.schemaVersion, MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA)));
test("N publishes an explicit overlay version", () => withArtifact((a) => assert.equal(a.overlayVersion, MHS_SEMANTIC_GROUPING_OVERLAY_VERSION)));
test("N records the explicit authorization decision", () => withArtifact((a) => assert.equal(a.decision, "AUTHORIZE_REVIEWED_SEMANTIC_EDGE_APPLICATION")));
test("N applies exactly two reviewed edges", () => withArtifact((a) => assert.equal(a.appliedEdges.length, 2)));
test("N applies only NEAR_DUPLICATE edges", () => withArtifact((a) => assert.ok(a.appliedEdges.every((e) => e.semanticRelationship === "NEAR_DUPLICATE"))));
test("N current authority contains no DUPLICATE edge", () => withArtifact((a) => assert.equal(a.appliedEdges.filter((e) => e.semanticRelationship as string === "DUPLICATE").length, 0)));
test("N RELATED_BUT_DISTINCT cannot become an edge", () => assert.equal(authorizeReviewedSemanticEdge(evidence("RELATED_BUT_DISTINCT"), true), null));
test("N UNRELATED cannot become an edge", () => assert.equal(authorizeReviewedSemanticEdge(evidence("UNRELATED"), true), null));
test("N NEEDS_ADJUDICATION fails closed", () => assert.throws(() => authorizeReviewedSemanticEdge(evidence("NEEDS_ADJUDICATION"), true), /fails closed/));
test("N score alone cannot authorize an edge", () => assert.throws(() => authorizeReviewedSemanticEdge(evidence(), false), /score alone/));
test("N 0.94 alone cannot authorize an edge", () => assert.equal(authorizeReviewedSemanticEdge(evidence("UNRELATED", 0.94), true), null));
test("N exact-pair contradiction blocks authority", () => assert.throws(() => assertNoContradictorySemanticEvidence([evidence(), evidence("UNRELATED")]), /Contradictory/));
test("N canonical unordered pair identity is enforced", () => { const record = { ...evidence(), pairKey: "b::a" }; assert.throws(() => authorizeReviewedSemanticEdge(record, true), /Unauthorized/); assert.equal(canonicalSemanticPairKey("b", "a"), "a::b"); });
test("N creates exactly one external component", () => withArtifact((a) => assert.equal(a.components.length, 1)));
test("N component has exactly three members", () => withArtifact((a) => assert.equal(a.components[0].memberCount, 3)));
test("N does not infer the transitive boundary pair", () => withArtifact((a) => { assert.equal(a.transitivityPolicy.unreviewedPairRelationshipInferred, false); assert.equal(a.transitivityPolicy.unreviewedPairKeys.length, 1); assert.ok(!a.components[0].edgePairKeys.includes(a.transitivityPolicy.unreviewedPairKeys[0])); }));
test("N stable group ID is deterministic", () => assert.equal(stableSemanticGroupId(["a", "b"], ["e"]), stableSemanticGroupId(["a", "b"], ["e"])));
test("N stable group ID ignores member and edge order", () => assert.equal(stableSemanticGroupId(["b", "a"], ["z", "e"]), stableSemanticGroupId(["a", "b"], ["e", "z"])));
test("N overlay edge order is deterministic", () => withArtifact((a) => assert.deepEqual(a.appliedEdges.map((e) => e.pairKey), [...a.appliedEdges.map((e) => e.pairKey)].sort())));
test("N connected components are deterministic", () => withArtifact((a) => { const forward = deriveAuthoritativeSemanticComponents(a.appliedEdges); const reverse = deriveAuthoritativeSemanticComponents([...a.appliedEdges].reverse()); assert.deepEqual(forward, reverse); }));
test("N stable group ID has semantic prefix", () => assert.match(stableSemanticGroupId(["a", "b"], ["e"]), /^semantic_[a-f0-9]{64}$/));
test("N edge IDs are distinct and stable", () => withArtifact((a) => { assert.equal(new Set(a.appliedEdges.map((e) => e.edgeId)).size, 2); for (const e of a.appliedEdges) assert.equal(e.edgeId, authoritativeSemanticEdgeId({ pairKey: e.pairKey, semanticRelationship: e.semanticRelationship, authorityArtifactSha256: e.authorityArtifactSha256 })); }));
test("N edge provenance digests are validated", () => withArtifact((a) => assert.doesNotThrow(() => validateMhsSemanticGroupingOverlayArtifact(a))));
test("N component digest is validated", () => withArtifact((a) => assert.match(a.components[0].componentDigest, /^[a-f0-9]{64}$/)));
test("N leaves candidate bytes unchanged", () => { const before = fs.readFileSync(paths.candidatePath); const d = temporary(); try { create(d); assert.ok(before.equals(fs.readFileSync(paths.candidatePath))); } finally { clean(d); } });
test("N reports no candidate row mutation", () => withArtifact((a) => assert.equal(a.candidateProtection.candidateRowsMutated, false)));
test("N writes no semanticGroupId to candidates", () => withArtifact((a) => assert.equal(a.candidateProtection.semanticGroupIdWrittenToCandidates, false)));
test("N leaves every existing grouping ownership field unchanged", () => { const candidate = fs.readFileSync(paths.candidatePath, "utf8"); const integrity = JSON.parse(fs.readFileSync(paths.candidateIntegrityPath, "utf8")); const before = sha(paths.candidateIntegrityPath); const d = temporary(); try { create(d); assert.equal(sha(paths.candidateIntegrityPath), before); assert.equal(fs.readFileSync(paths.candidatePath, "utf8"), candidate); assert.ok(integrity.rows.every((r: any) => r.exactDuplicateGroupId === null && r.normalizedDuplicateGroupId === null && r.lineageGroupId === null && r.lineageRootId === r.sourceRowId)); } finally { clean(d); } });
test("N creates no split assignments", () => withArtifact((a) => assert.deepEqual(a.splitAssignments, [])));
test("N leaves all candidate splits UNASSIGNED", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")); assert.ok(candidate.rows.filter((r: any) => r.candidateAdmitted).every((r: any) => !("split" in r) || r.split === "UNASSIGNED")); });
test("N keeps trainingEligible at zero", () => withArtifact((a) => assert.equal(a.trainingEligibleCount, 0)));
test("N binds all 86 admitted candidates", () => withArtifact((a) => assert.equal(a.candidateProtection.admittedCandidateCount, 86)));
test("N changes no moderation decisions", () => withArtifact((a) => assert.equal(a.candidateProtection.moderationDecisionChanges, 0)));
test("N accesses no frozen benchmark", () => withArtifact((a) => assert.equal(a.frozenBenchmarkAccessed, false)));
test("N rejects changed candidate authority", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { candidatePath: changed(d, paths.candidatePath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed integrity authority", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { candidateIntegrityPath: changed(d, paths.candidateIntegrityPath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed current semantic audit", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { currentSemanticAuditPath: changed(d, paths.currentSemanticAuditPath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed H authority", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { hValidatedPath: changed(d, paths.hValidatedPath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed J authority", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { jValidatedPath: changed(d, paths.jValidatedPath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed L authorization", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { lAuthorizationPath: changed(d, paths.lAuthorizationPath) }), /SHA-256/); } finally { clean(d); } });
test("N rejects changed M authority", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { mApplicationContractPath: changed(d, paths.mApplicationContractPath) }), /SHA-256/); } finally { clean(d); } });
test("N refuses artifact overwrite", () => { const d = temporary(); try { create(d); assert.throws(() => create(d), /already exists/); } finally { clean(d); } });
test("N partial publication leaves no artifact", () => { const d = temporary(); try { assert.throws(() => create(d, {}, () => { throw new Error("simulated"); }), /simulated/); assert.equal(fs.existsSync(path.join(d, MHS_SEMANTIC_GROUPING_OVERLAY_FILENAME)), false); assert.deepEqual(fs.existsSync(d) ? fs.readdirSync(d) : [], []); } finally { clean(d); } });
test("N artifact serialization is deterministic", () => { const a = temporary(); const b = temporary(); try { assert.equal(fs.readFileSync(create(a).artifactPath, "utf8"), fs.readFileSync(create(b).artifactPath, "utf8")); } finally { clean(a); clean(b); } });
test("N rejects a non-strict timestamp", () => { const d = temporary(); try { assert.throws(() => createMhsSemanticGroupingOverlay({ ...paths, outputDirectory: d, generatedAt: "2026-09-13" }), /timestamp/); } finally { clean(d); } });
test("N validator rejects a stale payload digest", () => withArtifact((a) => { const v = clone(a); v.decision = "NO"; assert.throws(() => validateMhsSemanticGroupingOverlayArtifact(v), /Invalid/); }));
test("N validator rejects transitive pair inference", () => withArtifact((a) => { const v = clone(a); v.transitivityPolicy.unreviewedPairRelationshipInferred = true; assert.throws(() => validateMhsSemanticGroupingOverlayArtifact(v), /Invalid/); }));
test("N validator rejects changed component identity", () => withArtifact((a) => { const v = clone(a); v.components[0].semanticGroupId = `semantic_${"0".repeat(64)}`; assert.throws(() => validateMhsSemanticGroupingOverlayArtifact(v), /Invalid/); }));
test("N stable ID rejects duplicate members", () => assert.throws(() => stableSemanticGroupId(["a", "a"], ["e"]), /Invalid/));
test("N stable ID rejects duplicate edges", () => assert.throws(() => stableSemanticGroupId(["a", "b"], ["e", "e"]), /Invalid/));
test("N stable ID rejects an empty edge set", () => assert.throws(() => stableSemanticGroupId(["a", "b"], []), /Invalid/));
test("N stable ID rejects a singleton component", () => assert.throws(() => stableSemanticGroupId(["a"], ["e"]), /Invalid/));
test("N component records future split isolation only", () => withArtifact((a) => assert.equal(a.components[0].splitIsolationRequirement, "MUST_REMAIN_TOGETHER_IN_FUTURE_SPLITS")));
test("N binds the immutable M contract and candidate membership", () => withArtifact((a) => { assert.equal(a.authorities.mApplicationContractSha256, MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256); assert.equal(a.authorities.candidateMembershipDigest, MHS_CANDIDATE_MEMBERSHIP_DIGEST); }));
test("N implementation contains no frozen benchmark dependency", () => { const source = ["src/research/textModerationDataset/mhsSemanticGroupingOverlay.ts", "src/scripts/createMhsSemanticGroupingOverlay.ts"].map((f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|frozen.?140/i); assert.equal(MHS_SEMANTIC_GROUPING_OVERLAY_POLICY, "STHN_MHS_SEMANTIC_GROUPING_OVERLAY_POLICY_V1"); });
