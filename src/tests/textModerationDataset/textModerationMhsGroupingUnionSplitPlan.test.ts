import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MHS_GROUPING_UNION_SPLIT_PLAN_FILENAME, MHS_GROUPING_UNION_SPLIT_PLAN_SEED, MHS_SEMANTIC_GROUPING_OVERLAY_SHA256, MHS_UNION_EDGE_OWNERSHIP, MHS_UNION_EDGE_TYPES,
  GroupMembershipAuthority, MhsGroupingUnionSplitPlanArtifact, auditUnionComponents, canonicalUnionEdgeId, createMhsGroupingUnionSplitPlan,
  deriveUnionComponents, edgesFromGroupAuthorities, planComponentSplits, validateMhsGroupingUnionSplitPlanArtifact,
} from "../../research/textModerationDataset/mhsGroupingUnionSplitPlan";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates"); const review = path.join(root, "semantic-review");
const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  currentSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"), mApplicationContractPath: path.join(review, "mhs-reviewed-semantic-application-contract-v1.json"),
  nSemanticOverlayPath: path.join(review, "mhs-semantic-grouping-overlay-v1.json") };
const fixedAt = "2026-09-13T16:00:00.000Z"; const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-union-o-")); const clean = (d: string): void => fs.rmSync(d, { recursive: true, force: true });
const sha = (f: string): string => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); const changed = (d: string, f: string): string => { const t = path.join(d, path.basename(f)); fs.writeFileSync(t, `${fs.readFileSync(f, "utf8")} `); return t; };
const create = (d: string, overrides: Partial<typeof paths> = {}, publishAtomic?: (temporaryPath: string, targetPath: string) => void) => createMhsGroupingUnionSplitPlan({ ...paths, ...overrides, outputDirectory: d, generatedAt: fixedAt, publishAtomic });
const withArtifact = (fn: (a: MhsGroupingUnionSplitPlanArtifact) => void): void => { const d = temporary(); try { fn(create(d).artifact); } finally { clean(d); } }; const clone = (v: unknown): any => JSON.parse(JSON.stringify(v));
const group = (edgeType: GroupMembershipAuthority["edgeType"]): GroupMembershipAuthority => ({ edgeType, groupId: `group-${edgeType}`, memberCandidateIds: ["b", "a", "c"], sourceAuthority: "test-authority" });

test("O enforces candidate SHA", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { candidatePath: changed(d, paths.candidatePath) }), /SHA-256/); } finally { clean(d); } });
test("O enforces candidate membership digest", () => withArtifact((a) => { const v = clone(a); v.authorities.candidateMembershipDigest = "0".repeat(64); assert.throws(() => validateMhsGroupingUnionSplitPlanArtifact(v), /Invalid/); }));
test("O enforces candidate integrity SHA", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { candidateIntegrityPath: changed(d, paths.candidateIntegrityPath) }), /SHA-256/); } finally { clean(d); } });
test("O enforces semantic overlay SHA", () => { const d = temporary(); try { assert.throws(() => create(path.join(d, "out"), { nSemanticOverlayPath: changed(d, paths.nSemanticOverlayPath) }), /SHA-256/); } finally { clean(d); } });
test("O exact duplicate authority emits split-binding edges", () => assert.ok(edgesFromGroupAuthorities([group("EXACT_DUPLICATE")]).every((e) => e.edgeType === "EXACT_DUPLICATE" && e.splitBinding)));
test("O normalized duplicate authority emits split-binding edges", () => assert.ok(edgesFromGroupAuthorities([group("NORMALIZED_DUPLICATE")]).every((e) => e.edgeType === "NORMALIZED_DUPLICATE")));
test("O source-native near-pair authority is handled when available", () => assert.ok(edgesFromGroupAuthorities([group("SOURCE_NATIVE_NEAR_PAIR")]).every((e) => e.edgeType === "SOURCE_NATIVE_NEAR_PAIR")));
test("O template-family authority is handled when available", () => assert.ok(edgesFromGroupAuthorities([group("TEMPLATE_FAMILY")]).every((e) => e.edgeType === "TEMPLATE_FAMILY")));
test("O lineage authority emits provenance edges", () => assert.ok(edgesFromGroupAuthorities([group("LINEAGE")]).every((e) => e.impliesProvenanceLineage)));
test("O semantic overlay authority emits exactly two current edges", () => withArtifact((a) => assert.equal(a.edgeTypeSummary.SEMANTIC_REVIEWED, 2)));
test("O edge types remain distinct", () => assert.deepEqual(Object.keys(MHS_UNION_EDGE_OWNERSHIP), [...MHS_UNION_EDGE_TYPES]));
test("O same label, language, source or topic creates no edge", () => assert.deepEqual(edgesFromGroupAuthorities([]), []));
test("O graph is deterministic", () => withArtifact((a) => assert.deepEqual(deriveUnionComponents(a.components.flatMap((c) => c.memberCandidateIds), a.unionEdges), deriveUnionComponents(a.components.flatMap((c) => c.memberCandidateIds).reverse(), [...a.unionEdges].reverse()))));
test("O canonical edge identity is deterministic and unordered", () => assert.equal(canonicalUnionEdgeId("LINEAGE", "a", "b", "g"), canonicalUnionEdgeId("LINEAGE", "b", "a", "g")));
test("O connected components are deterministic", () => { const edges = edgesFromGroupAuthorities([group("LINEAGE")]); assert.deepEqual(deriveUnionComponents(["a", "b", "c", "d"], edges), deriveUnionComponents(["d", "c", "b", "a"], [...edges].reverse())); });
test("O singleton candidates become components", () => assert.deepEqual(deriveUnionComponents(["a", "b"], []).map((c) => c.memberCandidateIds), [["a"], ["b"]]));
test("O component IDs are deterministic", () => assert.equal(deriveUnionComponents(["a"], [])[0].componentId, deriveUnionComponents(["a"], [])[0].componentId));
test("O component IDs ignore insertion order", () => { const edges = edgesFromGroupAuthorities([group("LINEAGE")]); assert.equal(deriveUnionComponents(["a", "b", "c"], edges)[0].componentId, deriveUnionComponents(["c", "b", "a"], [...edges].reverse())[0].componentId); });
test("O dry-run never splits a component", () => withArtifact((a) => assert.ok(a.targetRatioEvaluations.every((p) => p.componentIsolationViolations === 0 && new Set(p.hypotheticalAssignments.map((x) => x.componentId)).size === a.components.length))));
test("O semantic A-B-C component remains intact", () => withArtifact((a) => { const semantic = a.components.find((c) => c.containsSemanticEdges)!; assert.equal(semantic.memberCount, 3); for (const p of a.targetRatioEvaluations) assert.equal(p.hypotheticalAssignments.filter((x) => x.componentId === semantic.componentId).length, 1); }));
test("O does not fabricate A-C pair authority", () => withArtifact((a) => { const semantic = a.components.find((c) => c.containsSemanticEdges)!; const outer = [semantic.memberCandidateIds[0], semantic.memberCandidateIds[2]].join("::"); assert.ok(!a.unionEdges.some((e) => e.pairKey === outer)); }));
test("O mixed-label components are surfaced without resolution", () => withArtifact((a) => { const c = { ...a.components[0], mixedAllowBlock: true }; const findings = auditUnionComponents([c]); assert.ok(findings.some((f) => f.code === "MIXED_ALLOW_BLOCK_COMPONENT" && f.severity === "REVIEW_REQUIRED")); }));
test("O collision audit is deterministic", () => withArtifact((a) => assert.deepEqual(auditUnionComponents(a.components), auditUnionComponents([...a.components].reverse()))));
test("O 80/10/10 dry run is deterministic", () => withArtifact((a) => { const p = a.targetRatioEvaluations.find((x) => x.ratio === "80/10/10")!; const rows = new Map((JSON.parse(fs.readFileSync(paths.candidateIntegrityPath, "utf8")) as any).rows.map((r: any) => [r.sourceRowId, r])); assert.deepEqual(p, planComponentSplits(a.components, rows as any, "80/10/10")); }));
test("O 70/15/15 dry run is deterministic", () => withArtifact((a) => { const p = a.targetRatioEvaluations.find((x) => x.ratio === "70/15/15")!; const rows = new Map((JSON.parse(fs.readFileSync(paths.candidateIntegrityPath, "utf8")) as any).rows.map((r: any) => [r.sourceRowId, r])); assert.deepEqual(p, planComponentSplits(a.components, rows as any, "70/15/15")); }));
test("O planning seed is enforced", () => withArtifact((a) => { const rows = new Map((JSON.parse(fs.readFileSync(paths.candidateIntegrityPath, "utf8")) as any).rows.map((r: any) => [r.sourceRowId, r])); assert.throws(() => planComponentSplits(a.components, rows as any, "80/10/10", "wrong" as any), /seed/); assert.equal(a.planner.seed, MHS_GROUPING_UNION_SPLIT_PLAN_SEED); }));
test("O target versus achieved calculations are exact", () => withArtifact((a) => assert.ok(a.targetRatioEvaluations.every((p) => Object.values(p.deviationCandidateCounts).every((n) => n === 0)))));
test("O candidate rows remain byte-identical", () => { const before = fs.readFileSync(paths.candidatePath); const d = temporary(); try { create(d); assert.ok(before.equals(fs.readFileSync(paths.candidatePath))); } finally { clean(d); } });
test("O writes no split field", () => withArtifact((a) => assert.deepEqual(a.candidateProtection.actualSplitAssignments, [])));
test("O writes no semanticGroupId", () => withArtifact((a) => assert.equal((a.candidateProtection.groupingFieldsWritten as readonly string[]).includes("semanticGroupId"), false)));
test("O writes no duplicateGroupId", () => withArtifact((a) => assert.equal((a.candidateProtection.groupingFieldsWritten as readonly string[]).includes("duplicateGroupId"), false)));
test("O writes no nearPairGroupId", () => withArtifact((a) => assert.equal((a.candidateProtection.groupingFieldsWritten as readonly string[]).includes("nearPairGroupId"), false)));
test("O membership remains 86", () => withArtifact((a) => assert.equal(a.graphSummary.candidateNodeCount, 86)));
test("O moderation remains 58 ALLOW and 28 BLOCK", () => { const c = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")); const rows = c.rows.filter((r: any) => r.candidateAdmitted); assert.deepEqual([rows.filter((r: any) => r.reviewerDecision === "ALLOW").length, rows.filter((r: any) => r.reviewerDecision === "BLOCK").length], [58, 28]); });
test("O trainingEligible remains zero", () => withArtifact((a) => assert.equal(a.candidateProtection.trainingEligibleCount, 0)));
test("O logic does not access frozen 140", () => { const source = ["src/research/textModerationDataset/mhsGroupingUnionSplitPlan.ts", "src/scripts/createMhsGroupingUnionSplitPlan.ts"].map((f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|protectedFrozenBenchmarkContaminationDetector|frozen.?140/i); });
test("O planning artifact is canonical and deterministic", () => { const a = temporary(); const b = temporary(); try { const one = create(a); const two = create(b); assert.equal(fs.readFileSync(one.artifactPath, "utf8"), fs.readFileSync(two.artifactPath, "utf8")); assert.doesNotThrow(() => validateMhsGroupingUnionSplitPlanArtifact(one.artifact)); } finally { clean(a); clean(b); } });
test("O artifact refuses overwrite", () => { const d = temporary(); try { create(d); assert.throws(() => create(d), /already exists/); } finally { clean(d); } });
test("O partial publication leaves no authoritative artifact", () => { const d = temporary(); try { assert.throws(() => create(d, {}, () => { throw new Error("simulated"); }), /simulated/); assert.equal(fs.existsSync(path.join(d, MHS_GROUPING_UNION_SPLIT_PLAN_FILENAME)), false); assert.deepEqual(fs.existsSync(d) ? fs.readdirSync(d) : [], []); } finally { clean(d); } });
test("O current graph has 83 singleton and one non-singleton component", () => withArtifact((a) => assert.deepEqual([a.graphSummary.singletonCount, a.graphSummary.nonSingletonCount], [83, 1])));
test("O current edge counts are authority-derived", () => withArtifact((a) => assert.deepEqual(a.edgeTypeSummary, { EXACT_DUPLICATE: 0, NORMALIZED_DUPLICATE: 0, SEMANTIC_REVIEWED: 2, SOURCE_NATIVE_NEAR_PAIR: 0, TEMPLATE_FAMILY: 0, LINEAGE: 0 })));
test("O semantic overlay identity remains frozen", () => { assert.equal(sha(paths.nSemanticOverlayPath), MHS_SEMANTIC_GROUPING_OVERLAY_SHA256); });
test("O recommendation remains non-authoritative", () => withArtifact((a) => assert.equal(a.recommendedFutureSplitStrategy.authority, "RECOMMENDATION_ONLY")));
