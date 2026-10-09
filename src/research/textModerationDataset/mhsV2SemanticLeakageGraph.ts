import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_UNION_EDGE_OWNERSHIP, MhsUnionEdge, canonicalUnionEdgeId, deriveUnionComponents,
} from "./mhsGroupingUnionSplitPlan";
import { MhsV2ExpansionCandidateArtifact } from "./mhsV2ExpansionCandidateAcquisition";
import { MhsV2ExpansionConsolidationArtifact } from "./mhsV2ExpansionConsolidation";
import {
  HistoricalAnchor, MHS_V2_COLLISION_DISPOSITION, MHS_V2_COLLISION_REASON,
  MhsV2CollisionAnalysisArtifact, collisionQuarantineAppliesToComponent,
} from "./mhsV2HistoricalSplitAnchorCollision";
import { reconcileMhsV2SemanticCalibrationRows } from "./mhsV2SemanticCalibrationEvaluation";
import {
  MHS_V2_ALLOWED_EDGE_AUTHORITIES, MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST,
  MHS_V2_LEAKAGE_ANALYSIS_SHA256, MHS_V2_LEAKAGE_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_LEAKAGE_CERTIFICATION_SHA256, MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST,
  MHS_V2_LEAKAGE_POLICY_SHA256, MHS_V2_LEAKAGE_STRATEGY, MhsV2AllowedEdgeAuthority,
  MhsV2LeakageControlAnalysisArtifact, MhsV2LeakageControlCertificationArtifact,
  MhsV2LeakageControlInputs, MhsV2LeakageControlPolicyArtifact,
  createMhsV2LeakageControlAnalysis, createMhsV2LeakageControlCertification,
  createMhsV2LeakageControlPolicy, mhsV2MayCreateWithinV2Edge,
  resolveMhsV2HistoricalAnchorDisposition, resolveMhsV2PlacementPrecedence,
  validateMhsV2LeakageControlAnalysis, validateMhsV2LeakageControlCertification,
  validateMhsV2LeakageControlPolicy,
} from "./mhsV2SemanticLeakageControlPolicy";

export const MHS_V2_LEAKAGE_GRAPH_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_GRAPH_V1" as const;
export const MHS_V2_LEAKAGE_COMPONENTS_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_COMPONENTS_V1" as const;
export const MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_GRAPH_ANALYSIS_V1" as const;
export const MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_GRAPH_CERTIFICATION_V1" as const;
export const MHS_V2_LEAKAGE_GRAPH_VERSION = "MHS_V2_SEMANTIC_LEAKAGE_GRAPH_V1" as const;
export const MHS_V2_LEAKAGE_GRAPH_FILENAME = "mhs-v2-semantic-leakage-graph-v1.json" as const;
export const MHS_V2_LEAKAGE_COMPONENTS_FILENAME = "mhs-v2-semantic-leakage-components-v1.json" as const;
export const MHS_V2_LEAKAGE_GRAPH_ANALYSIS_FILENAME = "mhs-v2-semantic-leakage-graph-analysis-v1.json" as const;
export const MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_FILENAME = "mhs-v2-semantic-leakage-graph-certification-v1.json" as const;
export const MHS_V2_LEAKAGE_GRAPH_FROZEN_AT = "2026-09-21T12:00:00.000Z" as const;

export const MHS_V2_LEAKAGE_GRAPH_SHA256 = "07da805e7e928cfd37be6a661e3e43bb581719d88d59d4962a4b9fbe5142d2f6" as const;
export const MHS_V2_LEAKAGE_GRAPH_PAYLOAD_DIGEST = "40ad87f7af213290dd15ebea7879472ec7492026d827fa1aa2a5c00ac1ed7ca5" as const;
export const MHS_V2_LEAKAGE_COMPONENTS_SHA256 = "32c25a5acacc3327596df8339f641afa80ee230616e8b384c6a5c9fb86cfcdab" as const;
export const MHS_V2_LEAKAGE_COMPONENTS_PAYLOAD_DIGEST = "b77c858766f6412ddf2388ee80d9a35f0c8ca13dba42b5e6d3e6901ed9ad3d28" as const;
export const MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SHA256 = "139c2b69cee072c124bf50e2833f1cfb708c2de14f3583b4876d4334aae3db7d" as const;
export const MHS_V2_LEAKAGE_GRAPH_ANALYSIS_PAYLOAD_DIGEST = "6aac0248f4288bd9442c6a1f347a3800fe27e92e13626f0e3505933f7a187b63" as const;
export const MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SHA256 = "f434b75767f8b3db3c4974277dca1fdd91a0449aedac8618ba36e3ea3cef754c" as const;
export const MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_PAYLOAD_DIGEST = "55535bbd05a657f86d0c83d48cd3e89439810949ae609de3473d1167c453e230" as const;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
const sortedPair = (a: string, b: string): readonly [string, string] => a.localeCompare(b) <= 0 ? [a, b] : [b, a];

export interface MhsV2LeakageGraphInputs {
  readonly leakageControlInputs: MhsV2LeakageControlInputs;
  readonly successorPolicyBytes: Buffer;
  readonly successorAnalysisBytes: Buffer;
  readonly successorCertificationBytes: Buffer;
}

interface GraphAuthorities {
  readonly successorPolicySha256: typeof MHS_V2_LEAKAGE_POLICY_SHA256;
  readonly successorPolicyPayloadDigest: typeof MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST;
  readonly successorAnalysisSha256: typeof MHS_V2_LEAKAGE_ANALYSIS_SHA256;
  readonly successorAnalysisPayloadDigest: typeof MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST;
  readonly successorCertificationSha256: typeof MHS_V2_LEAKAGE_CERTIFICATION_SHA256;
  readonly successorCertificationPayloadDigest: typeof MHS_V2_LEAKAGE_CERTIFICATION_PAYLOAD_DIGEST;
}
const authorities = (): GraphAuthorities => ({ successorPolicySha256: MHS_V2_LEAKAGE_POLICY_SHA256, successorPolicyPayloadDigest: MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST, successorAnalysisSha256: MHS_V2_LEAKAGE_ANALYSIS_SHA256, successorAnalysisPayloadDigest: MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST, successorCertificationSha256: MHS_V2_LEAKAGE_CERTIFICATION_SHA256, successorCertificationPayloadDigest: MHS_V2_LEAKAGE_CERTIFICATION_PAYLOAD_DIGEST });

interface VerifiedInputs {
  readonly candidate: MhsV2ExpansionCandidateArtifact;
  readonly consolidation: MhsV2ExpansionConsolidationArtifact;
  readonly collision: MhsV2CollisionAnalysisArtifact;
}
const verifyInputs = (inputs: MhsV2LeakageGraphInputs): VerifiedInputs => {
  const expectedPolicy = createMhsV2LeakageControlPolicy(inputs.leakageControlInputs);
  const expectedAnalysis = createMhsV2LeakageControlAnalysis(inputs.leakageControlInputs);
  const expectedCertification = createMhsV2LeakageControlCertification(expectedPolicy, expectedAnalysis);
  if (sha256(inputs.successorPolicyBytes) !== MHS_V2_LEAKAGE_POLICY_SHA256 || sha256(inputs.successorAnalysisBytes) !== MHS_V2_LEAKAGE_ANALYSIS_SHA256 || sha256(inputs.successorCertificationBytes) !== MHS_V2_LEAKAGE_CERTIFICATION_SHA256) throw new Error("T6L-7K-B successor authority SHA mismatch");
  const policy = parse<MhsV2LeakageControlPolicyArtifact>(inputs.successorPolicyBytes), analysis = parse<MhsV2LeakageControlAnalysisArtifact>(inputs.successorAnalysisBytes), certification = parse<MhsV2LeakageControlCertificationArtifact>(inputs.successorCertificationBytes);
  validateMhsV2LeakageControlPolicy(policy); validateMhsV2LeakageControlAnalysis(analysis); validateMhsV2LeakageControlCertification(certification);
  if (canonicalJson(policy) !== canonicalJson(expectedPolicy) || canonicalJson(analysis) !== canonicalJson(expectedAnalysis) || canonicalJson(certification) !== canonicalJson(expectedCertification)) throw new Error("T6L-7K-B successor authority replay mismatch");
  if (policy.selectedStrategy !== MHS_V2_LEAKAGE_STRATEGY) throw new Error("T6L-7K-B wrong successor strategy");
  const candidate = parse<MhsV2ExpansionCandidateArtifact>(inputs.leakageControlInputs.candidateBytes);
  const consolidation = parse<MhsV2ExpansionConsolidationArtifact>(inputs.leakageControlInputs.collisionInputs.consolidationBytes);
  const collision = parse<MhsV2CollisionAnalysisArtifact>(inputs.leakageControlInputs.collisionAnalysisBytes);
  if (candidate.rows.length !== 400 || consolidation.rows.length !== 400 || collision.constraints.length !== 2) throw new Error("T6L-7K-B frozen row or anchor count mismatch");
  return { candidate, consolidation, collision };
};

export interface MhsV2LeakageEvidence {
  readonly authority: MhsV2AllowedEdgeAuthority;
  readonly authorityIdentity: string;
  readonly sourceAuthoritySha256: string;
  readonly reviewRowNumber: number | null;
  readonly reviewerId: "reviewer_a_01" | null;
  readonly relationship: "DUPLICATE" | "NEAR_DUPLICATE" | null;
}
export interface MhsV2LeakageGraphEdge extends MhsUnionEdge { readonly evidence: readonly MhsV2LeakageEvidence[] }

export const createMhsV2LeakageEdge = (candidateAId: string, candidateBId: string, candidateATextSha256: string, candidateBTextSha256: string, evidence: readonly MhsV2LeakageEvidence[]): MhsV2LeakageGraphEdge => {
  if (candidateAId === candidateBId || evidence.length === 0 || evidence.some((item) => !mhsV2MayCreateWithinV2Edge(item.authority))) throw new Error("T6L-7K-B unauthorized or invalid leakage edge");
  const [left, right] = sortedPair(candidateAId, candidateBId), textById = new Map([[candidateAId, candidateATextSha256], [candidateBId, candidateBTextSha256]]);
  const orderedEvidence = [...evidence].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const repositoryEdgeType: MhsUnionEdge["edgeType"] = orderedEvidence.some((item) => item.authority === "EXACT_DUPLICATE") ? "EXACT_DUPLICATE" : orderedEvidence.some((item) => item.authority === "NORMALIZED_DUPLICATE") ? "NORMALIZED_DUPLICATE" : orderedEvidence.some((item) => item.authority === "LINEAGE") ? "LINEAGE" : "SEMANTIC_REVIEWED";
  const authorityIdentity = digest(orderedEvidence), ownership = MHS_UNION_EDGE_OWNERSHIP[repositoryEdgeType];
  const base = { edgeType: repositoryEdgeType, sourceAuthority: digest(orderedEvidence.map((item) => item.sourceAuthoritySha256)), pairKey: `${left}::${right}`, candidateAId: left, candidateBId: right, candidateATextSha256: textById.get(left)!, candidateBTextSha256: textById.get(right)!, authorityIdentity, splitBinding: true as const, impliesSemanticEquivalence: ownership.impliesSemanticEquivalence, impliesProvenanceLineage: ownership.impliesProvenanceLineage, evidence: orderedEvidence };
  return { edgeId: canonicalUnionEdgeId(repositoryEdgeType, left, right, authorityIdentity), ...base, authorityDigest: digest(base) };
};

interface DerivedState {
  readonly edges: readonly MhsV2LeakageGraphEdge[];
  readonly components: readonly MhsV2LeakageComponent[];
  readonly membership: readonly { readonly candidateId: string; readonly componentId: string }[];
  readonly authorityCounts: Readonly<Record<MhsV2AllowedEdgeAuthority, number>>;
}

export interface MhsV2LeakageComponent {
  readonly componentId: string; readonly memberCandidateIds: readonly string[]; readonly memberTextSha256: readonly string[]; readonly memberCount: number; readonly edgeIds: readonly string[]; readonly edgeCount: number;
  readonly authorityComposition: Readonly<Record<string, number>>; readonly decisionComposition: Readonly<Record<string, number>>; readonly primaryCategoryComposition: Readonly<Record<string, number>>; readonly mixedDecisions: boolean; readonly mixedPrimaryCategories: boolean;
  readonly historicalAnchors: readonly HistoricalAnchor[]; readonly frozenAnchorSplits: readonly ("TRAIN" | "VALIDATION")[]; readonly anchorDisposition: string; readonly placementConstraint: string; readonly collisionQuarantine: boolean; readonly quarantineReason: typeof MHS_V2_COLLISION_REASON | null;
  readonly finalSplit: "UNASSIGNED"; readonly trainingEligibilityChanged: false; readonly componentDigest: string;
}

export const resolveMhsV2ComponentAnchorState = (memberCandidateIds: readonly string[], constraints: readonly { readonly v2CandidateId: string; readonly anchors: readonly HistoricalAnchor[] }[]): { readonly anchors: readonly HistoricalAnchor[]; readonly frozenAnchorSplits: readonly ("TRAIN" | "VALIDATION")[]; readonly anchorDisposition: string; readonly placementConstraint: string; readonly collisionQuarantine: boolean; readonly quarantineReason: typeof MHS_V2_COLLISION_REASON | null } => {
  const byCandidate = new Map(constraints.map((constraint) => [constraint.v2CandidateId, constraint]));
  const anchors = memberCandidateIds.flatMap((id) => byCandidate.get(id)?.anchors ?? []).sort((a, b) => a.reviewRowNumber - b.reviewRowNumber);
  const frozenAnchorSplits = [...new Set(anchors.map((anchor) => anchor.frozenSplit))].sort() as ("TRAIN" | "VALIDATION")[];
  const anchorDisposition = resolveMhsV2HistoricalAnchorDisposition(frozenAnchorSplits), collisionQuarantine = anchorDisposition === MHS_V2_COLLISION_REASON, placementConstraint = resolveMhsV2PlacementPrecedence(anchorDisposition, false);
  return { anchors, frozenAnchorSplits, anchorDisposition, placementConstraint, collisionQuarantine, quarantineReason: collisionQuarantine ? MHS_V2_COLLISION_REASON : null };
};

const groupEvidence = (candidate: MhsV2ExpansionCandidateArtifact, key: "exactTextDigest" | "normalizedTextFingerprint" | "lineageRootId", authority: "EXACT_DUPLICATE" | "NORMALIZED_DUPLICATE" | "LINEAGE"): MhsV2LeakageGraphEdge[] => {
  const groups = new Map<string, typeof candidate.rows[number][]>(); candidate.rows.forEach((row) => groups.set(row[key], [...(groups.get(row[key]) ?? []), row]));
  return [...groups.entries()].filter(([, rows]) => rows.length > 1).flatMap(([groupId, rows]) => rows.slice(1).map((row) => createMhsV2LeakageEdge(rows[0].candidateId, row.candidateId, rows[0].exactTextDigest, row.exactTextDigest, [{ authority, authorityIdentity: groupId, sourceAuthoritySha256: sha256(Buffer.from(groupId)), reviewRowNumber: null, reviewerId: null, relationship: null }])));
};

const deriveState = (inputs: MhsV2LeakageGraphInputs): DerivedState => {
  const verified = verifyInputs(inputs), rowsById = new Map(verified.consolidation.rows.map((row) => [row.candidateId, row]));
  const human = reconcileMhsV2SemanticCalibrationRows(inputs.leakageControlInputs.collisionInputs.evaluationInputs).filter((row) => row.scope === "A" && (row.relationship === "DUPLICATE" || row.relationship === "NEAR_DUPLICATE")).map((row) => { const relationship = row.relationship as "DUPLICATE" | "NEAR_DUPLICATE"; return createMhsV2LeakageEdge(row.candidateAId, row.candidateBId, row.candidateATextSha256, row.candidateBTextSha256, [{ authority: relationship === "DUPLICATE" ? "HUMAN_DUPLICATE" : "HUMAN_NEAR_DUPLICATE", authorityIdentity: row.pairId, sourceAuthoritySha256: MHS_V2_LEAKAGE_CERTIFICATION_SHA256, reviewRowNumber: row.reviewRowNumber, reviewerId: "reviewer_a_01", relationship }]); });
  const all = [...groupEvidence(verified.candidate, "exactTextDigest", "EXACT_DUPLICATE"), ...groupEvidence(verified.candidate, "normalizedTextFingerprint", "NORMALIZED_DUPLICATE"), ...groupEvidence(verified.candidate, "lineageRootId", "LINEAGE"), ...human];
  const byPair = new Map<string, MhsV2LeakageGraphEdge[]>(); all.forEach((edge) => byPair.set(edge.pairKey, [...(byPair.get(edge.pairKey) ?? []), edge]));
  const candidateById = new Map(verified.candidate.rows.map((row) => [row.candidateId, row]));
  const edges = [...byPair.values()].map((samePair) => { const first = samePair[0], evidence = samePair.flatMap((edge) => edge.evidence); return createMhsV2LeakageEdge(first.candidateAId, first.candidateBId, candidateById.get(first.candidateAId)!.exactTextDigest, candidateById.get(first.candidateBId)!.exactTextDigest, evidence); }).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  if (human.length !== 7 || edges.some((edge) => edge.evidence.some((item) => !mhsV2MayCreateWithinV2Edge(item.authority)))) throw new Error("T6L-7K-B edge authority reconciliation failed");
  const collisionIds = new Set(verified.collision.constraints.filter((constraint) => constraint.collision).map((constraint) => constraint.v2CandidateId));
  const components = deriveUnionComponents(verified.candidate.rows.map((row) => row.candidateId), edges).map((core): MhsV2LeakageComponent => {
    const memberRows = core.memberCandidateIds.map((id) => rowsById.get(id)!); const anchorState = resolveMhsV2ComponentAnchorState(core.memberCandidateIds, verified.collision.constraints), { anchors, frozenAnchorSplits, anchorDisposition, placementConstraint, quarantineReason } = anchorState, collisionQuarantine = collisionQuarantineAppliesToComponent(core.memberCandidateIds, collisionIds) || anchorState.collisionQuarantine;
    if (collisionQuarantine !== (anchorDisposition === MHS_V2_COLLISION_REASON) || (collisionQuarantine && placementConstraint !== MHS_V2_COLLISION_DISPOSITION)) throw new Error("T6L-7K-B collision propagation mismatch");
    const localEdges = edges.filter((edge) => core.edgeIds.includes(edge.edgeId)); const decisions = memberRows.map((row) => row.decision), primary = memberRows.map((row) => row.primaryCategory ?? "ALLOW_NONE");
    const base = { ...core, memberTextSha256: memberRows.map((row) => row.textSha256), memberCount: core.memberCandidateIds.length, edgeCount: core.edgeIds.length, authorityComposition: tally(localEdges.flatMap((edge) => edge.evidence.map((item) => item.authority))), decisionComposition: tally(decisions), primaryCategoryComposition: tally(primary), mixedDecisions: new Set(decisions).size > 1, mixedPrimaryCategories: new Set(primary).size > 1, historicalAnchors: anchors, frozenAnchorSplits, anchorDisposition, placementConstraint, collisionQuarantine, quarantineReason, finalSplit: "UNASSIGNED" as const, trainingEligibilityChanged: false as const };
    return { ...base, componentDigest: digest(base) };
  });
  const membership = components.flatMap((component) => component.memberCandidateIds.map((candidateId) => ({ candidateId, componentId: component.componentId }))).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const authorityCounts = Object.fromEntries(MHS_V2_ALLOWED_EDGE_AUTHORITIES.map((authority) => [authority, edges.reduce((sum, edge) => sum + edge.evidence.filter((item) => item.authority === authority).length, 0)])) as Record<MhsV2AllowedEdgeAuthority, number>;
  if (components.length !== 393 || membership.length !== 400 || new Set(membership.map((row) => row.candidateId)).size !== 400 || authorityCounts.EXACT_DUPLICATE !== 0 || authorityCounts.NORMALIZED_DUPLICATE !== 0 || authorityCounts.LINEAGE !== 0 || authorityCounts.HUMAN_DUPLICATE !== 3 || authorityCounts.HUMAN_NEAR_DUPLICATE !== 4) throw new Error("T6L-7K-B graph/component census mismatch");
  return { edges, components, membership, authorityCounts };
};

interface GraphBoundaries { readonly splitAssigned: false; readonly trainingEligibilityChanged: false; readonly classifierInferenceRun: false; readonly e5InferenceRun: false; readonly protectedBenchmarkContentAccessed: false; readonly internalTestContentAccessed: false; readonly trainingPerformed: false; readonly productionIntegrationPerformed: false }
const boundaries = (): GraphBoundaries => ({ splitAssigned: false, trainingEligibilityChanged: false, classifierInferenceRun: false, e5InferenceRun: false, protectedBenchmarkContentAccessed: false, internalTestContentAccessed: false, trainingPerformed: false, productionIntegrationPerformed: false });

export interface MhsV2LeakageGraphPayload { readonly schemaVersion: typeof MHS_V2_LEAKAGE_GRAPH_SCHEMA; readonly graphVersion: typeof MHS_V2_LEAKAGE_GRAPH_VERSION; readonly phase: "T6L-7K-B"; readonly status: "IMMUTABLE_LEAKAGE_GRAPH"; readonly authorities: GraphAuthorities; readonly nodeCount: 400; readonly edgeCount: 7; readonly authorityCounts: Readonly<Record<MhsV2AllowedEdgeAuthority, number>>; readonly nodes: readonly { readonly candidateId: string; readonly textSha256: string }[]; readonly edges: readonly MhsV2LeakageGraphEdge[]; readonly boundaries: GraphBoundaries; readonly frozenAt: typeof MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }
export type MhsV2LeakageGraphArtifact = MhsV2LeakageGraphPayload & { readonly graphPayloadDigest: string };
export interface MhsV2LeakageComponentsPayload { readonly schemaVersion: typeof MHS_V2_LEAKAGE_COMPONENTS_SCHEMA; readonly componentVersion: typeof MHS_V2_LEAKAGE_GRAPH_VERSION; readonly phase: "T6L-7K-B"; readonly status: "IMMUTABLE_CONNECTED_COMPONENTS"; readonly authorities: GraphAuthorities & { readonly graphSha256: string; readonly graphPayloadDigest: string }; readonly candidateCount: 400; readonly componentCount: 393; readonly singletonCount: number; readonly nonSingletonCount: number; readonly maximumComponentSize: number; readonly components: readonly MhsV2LeakageComponent[]; readonly candidateMembership: readonly { readonly candidateId: string; readonly componentId: string }[]; readonly membershipDigest: string; readonly boundaries: GraphBoundaries; readonly frozenAt: typeof MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }
export type MhsV2LeakageComponentsArtifact = MhsV2LeakageComponentsPayload & { readonly componentsPayloadDigest: string };
export interface MhsV2LeakageGraphAnalysisPayload { readonly schemaVersion: typeof MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SCHEMA; readonly analysisVersion: typeof MHS_V2_LEAKAGE_GRAPH_VERSION; readonly phase: "T6L-7K-B"; readonly status: "GRAPH_AND_COMPONENT_ANALYSIS_COMPLETE"; readonly authorities: GraphAuthorities & { readonly graphSha256: string; readonly graphPayloadDigest: string; readonly componentsSha256: string; readonly componentsPayloadDigest: string }; readonly summary: { readonly nodes: 400; readonly edges: 7; readonly components: 393; readonly componentSizeDistribution: Readonly<Record<string, number>>; readonly mixedDecisionComponents: number; readonly mixedPrimaryCategoryComponents: number; readonly anchoredComponents: number; readonly anchoredCandidates: number; readonly trainConstrainedComponents: number; readonly validationConstrainedComponents: number; readonly quarantinedComponents: number; readonly quarantinedCandidates: number; readonly unanchoredComponents: number; readonly assignedSplits: 0; readonly trainingEligibilityMutations: 0 }; readonly boundaries: GraphBoundaries; readonly frozenAt: typeof MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }
export type MhsV2LeakageGraphAnalysisArtifact = MhsV2LeakageGraphAnalysisPayload & { readonly analysisPayloadDigest: string };
export interface MhsV2LeakageGraphCertificationPayload { readonly schemaVersion: typeof MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SCHEMA; readonly certificationVersion: typeof MHS_V2_LEAKAGE_GRAPH_VERSION; readonly phase: "T6L-7K-B"; readonly status: "CERTIFIED"; readonly authorities: MhsV2LeakageGraphAnalysisPayload["authorities"] & { readonly analysisSha256: string; readonly analysisPayloadDigest: string }; readonly result: { readonly graphComplete: true; readonly componentPartitionComplete: true; readonly scopeAEdgesOnly: true; readonly scopeBAnchorsAreNotEdges: true; readonly collisionQuarantinePropagated: true; readonly historicalRowsRemainExternal: true; readonly deterministicReplayMatched: true }; readonly validation: { readonly immutableAtomicPublication: true; readonly overwriteRefusalVerified: true; readonly upstreamAuthoritiesUnchanged: true }; readonly boundaries: GraphBoundaries }
export type MhsV2LeakageGraphCertificationArtifact = MhsV2LeakageGraphCertificationPayload & { readonly certificationPayloadDigest: string };

export const createMhsV2LeakageGraph = (inputs: MhsV2LeakageGraphInputs): MhsV2LeakageGraphArtifact => { const state = deriveState(inputs), verified = verifyInputs(inputs); const payload: MhsV2LeakageGraphPayload = { schemaVersion: MHS_V2_LEAKAGE_GRAPH_SCHEMA, graphVersion: MHS_V2_LEAKAGE_GRAPH_VERSION, phase: "T6L-7K-B", status: "IMMUTABLE_LEAKAGE_GRAPH", authorities: authorities(), nodeCount: 400, edgeCount: 7, authorityCounts: state.authorityCounts, nodes: verified.consolidation.rows.map((row) => ({ candidateId: row.candidateId, textSha256: row.textSha256 })).sort((a, b) => a.candidateId.localeCompare(b.candidateId)), edges: state.edges, boundaries: boundaries(), frozenAt: MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }; return { ...payload, graphPayloadDigest: digest(payload) }; };
export const createMhsV2LeakageComponents = (inputs: MhsV2LeakageGraphInputs, graph: MhsV2LeakageGraphArtifact): MhsV2LeakageComponentsArtifact => { const state = deriveState(inputs); const sizes = state.components.map((component) => component.memberCount); const payload: MhsV2LeakageComponentsPayload = { schemaVersion: MHS_V2_LEAKAGE_COMPONENTS_SCHEMA, componentVersion: MHS_V2_LEAKAGE_GRAPH_VERSION, phase: "T6L-7K-B", status: "IMMUTABLE_CONNECTED_COMPONENTS", authorities: { ...authorities(), graphSha256: sha256(Buffer.from(canonicalJson(graph))), graphPayloadDigest: graph.graphPayloadDigest }, candidateCount: 400, componentCount: 393, singletonCount: sizes.filter((size) => size === 1).length, nonSingletonCount: sizes.filter((size) => size > 1).length, maximumComponentSize: Math.max(...sizes), components: state.components, candidateMembership: state.membership, membershipDigest: digest(state.membership), boundaries: boundaries(), frozenAt: MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }; return { ...payload, componentsPayloadDigest: digest(payload) }; };
export const createMhsV2LeakageGraphAnalysis = (graph: MhsV2LeakageGraphArtifact, components: MhsV2LeakageComponentsArtifact): MhsV2LeakageGraphAnalysisArtifact => { const componentSizeDistribution = tally(components.components.map((component) => String(component.memberCount))); const payload: MhsV2LeakageGraphAnalysisPayload = { schemaVersion: MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SCHEMA, analysisVersion: MHS_V2_LEAKAGE_GRAPH_VERSION, phase: "T6L-7K-B", status: "GRAPH_AND_COMPONENT_ANALYSIS_COMPLETE", authorities: { ...authorities(), graphSha256: sha256(Buffer.from(canonicalJson(graph))), graphPayloadDigest: graph.graphPayloadDigest, componentsSha256: sha256(Buffer.from(canonicalJson(components))), componentsPayloadDigest: components.componentsPayloadDigest }, summary: { nodes: 400, edges: 7, components: 393, componentSizeDistribution, mixedDecisionComponents: components.components.filter((component) => component.mixedDecisions).length, mixedPrimaryCategoryComponents: components.components.filter((component) => component.mixedPrimaryCategories).length, anchoredComponents: components.components.filter((component) => component.historicalAnchors.length > 0).length, anchoredCandidates: components.components.flatMap((component) => component.historicalAnchors.length ? component.memberCandidateIds.filter((id) => component.historicalAnchors.some((anchor) => anchor.v2CandidateId === id)) : []).length, trainConstrainedComponents: components.components.filter((component) => component.placementConstraint === "CONSTRAIN_TO_TRAIN").length, validationConstrainedComponents: components.components.filter((component) => component.placementConstraint === "CONSTRAIN_TO_VALIDATION").length, quarantinedComponents: components.components.filter((component) => component.collisionQuarantine).length, quarantinedCandidates: components.components.filter((component) => component.collisionQuarantine).reduce<number>((sum, component) => sum + component.memberCount, 0), unanchoredComponents: components.components.filter((component) => component.historicalAnchors.length === 0).length, assignedSplits: 0, trainingEligibilityMutations: 0 }, boundaries: boundaries(), frozenAt: MHS_V2_LEAKAGE_GRAPH_FROZEN_AT }; return { ...payload, analysisPayloadDigest: digest(payload) }; };
export const createMhsV2LeakageGraphCertification = (graph: MhsV2LeakageGraphArtifact, components: MhsV2LeakageComponentsArtifact, analysis: MhsV2LeakageGraphAnalysisArtifact): MhsV2LeakageGraphCertificationArtifact => { const payload: MhsV2LeakageGraphCertificationPayload = { schemaVersion: MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_LEAKAGE_GRAPH_VERSION, phase: "T6L-7K-B", status: "CERTIFIED", authorities: { ...analysis.authorities, analysisSha256: sha256(Buffer.from(canonicalJson(analysis))), analysisPayloadDigest: analysis.analysisPayloadDigest }, result: { graphComplete: true, componentPartitionComplete: true, scopeAEdgesOnly: true, scopeBAnchorsAreNotEdges: true, collisionQuarantinePropagated: true, historicalRowsRemainExternal: true, deterministicReplayMatched: true }, validation: { immutableAtomicPublication: true, overwriteRefusalVerified: true, upstreamAuthoritiesUnchanged: true }, boundaries: boundaries() }; return { ...payload, certificationPayloadDigest: digest(payload) }; };

export const validateMhsV2LeakageGraphArtifacts = (graph: MhsV2LeakageGraphArtifact, components: MhsV2LeakageComponentsArtifact, analysis: MhsV2LeakageGraphAnalysisArtifact, certification: MhsV2LeakageGraphCertificationArtifact): void => {
  const { graphPayloadDigest, ...graphPayload } = graph, { componentsPayloadDigest, ...componentsPayload } = components, { analysisPayloadDigest, ...analysisPayload } = analysis, { certificationPayloadDigest, ...certificationPayload } = certification;
  const source = canonicalJson([graph, components, analysis, certification]); const nodeIds = graph.nodes.map((node) => node.candidateId), nodeSet = new Set(nodeIds), edgeIds = graph.edges.map((edge) => edge.edgeId), pairKeys = graph.edges.map((edge) => edge.pairKey), memberIds = components.candidateMembership.map((row) => row.candidateId), componentMembers = components.components.flatMap((component) => component.memberCandidateIds).sort();
  const invalidEdge = graph.edges.some((edge) => edge.candidateAId === edge.candidateBId || !nodeSet.has(edge.candidateAId) || !nodeSet.has(edge.candidateBId) || edge.candidateAId.localeCompare(edge.candidateBId) >= 0 || edge.pairKey !== `${edge.candidateAId}::${edge.candidateBId}` || edge.evidence.some((item) => !mhsV2MayCreateWithinV2Edge(item.authority)));
  if (graph.schemaVersion !== MHS_V2_LEAKAGE_GRAPH_SCHEMA || graph.nodeCount !== 400 || graph.nodes.length !== 400 || nodeSet.size !== 400 || graph.edgeCount !== 7 || graph.edges.length !== 7 || new Set(edgeIds).size !== edgeIds.length || new Set(pairKeys).size !== pairKeys.length || invalidEdge || graphPayloadDigest !== digest(graphPayload) || graphPayloadDigest !== MHS_V2_LEAKAGE_GRAPH_PAYLOAD_DIGEST || sha256(Buffer.from(canonicalJson(graph))) !== MHS_V2_LEAKAGE_GRAPH_SHA256) throw new Error("Invalid T6L-7K-B graph");
  if (components.schemaVersion !== MHS_V2_LEAKAGE_COMPONENTS_SCHEMA || components.candidateCount !== 400 || components.componentCount !== 393 || components.singletonCount !== 389 || components.nonSingletonCount !== 4 || components.maximumComponentSize !== 4 || new Set(memberIds).size !== 400 || canonicalJson([...memberIds].sort()) !== canonicalJson(componentMembers) || components.membershipDigest !== digest(components.candidateMembership) || componentsPayloadDigest !== digest(componentsPayload) || componentsPayloadDigest !== MHS_V2_LEAKAGE_COMPONENTS_PAYLOAD_DIGEST || sha256(Buffer.from(canonicalJson(components))) !== MHS_V2_LEAKAGE_COMPONENTS_SHA256) throw new Error("Invalid T6L-7K-B components");
  if (analysis.schemaVersion !== MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SCHEMA || canonicalJson(analysis.summary.componentSizeDistribution) !== canonicalJson({ "1": 389, "2": 2, "3": 1, "4": 1 }) || analysis.summary.anchoredComponents !== 2 || analysis.summary.quarantinedComponents !== 1 || analysis.summary.quarantinedCandidates !== 4 || analysis.summary.assignedSplits !== 0 || analysis.summary.trainingEligibilityMutations !== 0 || analysisPayloadDigest !== digest(analysisPayload) || analysisPayloadDigest !== MHS_V2_LEAKAGE_GRAPH_ANALYSIS_PAYLOAD_DIGEST || sha256(Buffer.from(canonicalJson(analysis))) !== MHS_V2_LEAKAGE_GRAPH_ANALYSIS_SHA256) throw new Error("Invalid T6L-7K-B analysis");
  if (certification.schemaVersion !== MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SCHEMA || Object.values(certification.result).some((value) => value !== true) || Object.values(certification.validation).some((value) => value !== true) || certificationPayloadDigest !== digest(certificationPayload) || certificationPayloadDigest !== MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_PAYLOAD_DIGEST || sha256(Buffer.from(canonicalJson(certification))) !== MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_SHA256 || /"text"\s*:/u.test(source) || Object.values(graph.boundaries).some(Boolean) || Object.values(components.boundaries).some(Boolean) || Object.values(analysis.boundaries).some(Boolean) || Object.values(certification.boundaries).some(Boolean)) throw new Error("Invalid T6L-7K-B certification or boundary");
};

type QuadPublisher = (temporaryPaths: readonly string[], targetPaths: readonly string[]) => void;
const defaultPublisher: QuadPublisher = (temporaryPaths, targetPaths) => temporaryPaths.forEach((temporary, index) => fs.renameSync(temporary, targetPaths[index]));
export const publishMhsV2LeakageGraphAuthority = (graph: MhsV2LeakageGraphArtifact, components: MhsV2LeakageComponentsArtifact, analysis: MhsV2LeakageGraphAnalysisArtifact, certification: MhsV2LeakageGraphCertificationArtifact, outputDirectory: string, publish: QuadPublisher = defaultPublisher): { readonly paths: readonly string[]; readonly sha256: readonly string[] } => {
  validateMhsV2LeakageGraphArtifacts(graph, components, analysis, certification); fs.mkdirSync(outputDirectory, { recursive: true });
  const targets = [MHS_V2_LEAKAGE_GRAPH_FILENAME, MHS_V2_LEAKAGE_COMPONENTS_FILENAME, MHS_V2_LEAKAGE_GRAPH_ANALYSIS_FILENAME, MHS_V2_LEAKAGE_GRAPH_CERTIFICATION_FILENAME].map((filename) => path.join(outputDirectory, filename));
  if (targets.some((target) => fs.existsSync(target))) throw new Error("T6L-7K-B overwrite refused");
  const texts = [graph, components, analysis, certification].map((artifact) => canonicalJson(artifact)), nonce = crypto.randomBytes(8).toString("hex"), temporary = targets.map((target) => `${target}.${nonce}.tmp`);
  try { temporary.forEach((filename, index) => fs.writeFileSync(filename, texts[index], { flag: "wx" })); publish(temporary, targets); }
  catch (error) { [...temporary, ...targets].forEach((filename) => { if (fs.existsSync(filename)) fs.rmSync(filename); }); throw error; }
  return { paths: targets, sha256: texts.map((text) => sha256(Buffer.from(text))) };
};
