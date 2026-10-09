import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST, MhsCandidateIntegrityAuditArtifact, validateMhsCandidateIntegrityAuditArtifact } from "./mhsCandidateIntegrityAudit";
import { MHS_K_VALIDATED_SHA256, MhsReviewFloorAuthorizationArtifact, MhsReviewFloorSemanticAuditArtifact, validateMhsReviewFloorAuthorizationArtifact, validateMhsReviewFloorSemanticAuditArtifact } from "./mhsSemanticReviewFloorAuthorization";
import { MHS_SEMANTIC_I_VALIDATED_SHA256 } from "./mhsSemanticBoundaryReviewPacket";
import { MhsSemanticBoundaryValidatedArtifact, validateMhsSemanticBoundaryValidatedArtifact } from "./mhsSemanticBoundaryReviewValidation";
import { MhsSemanticValidatedReviewArtifact, validateMhsSemanticValidatedReviewArtifact } from "./mhsSemanticReviewValidation";
import {
  MHS_CANDIDATE_INTEGRITY_SHA256, MHS_L_AUTHORIZATION_PAYLOAD_DIGEST, MHS_L_AUTHORIZATION_SHA256, MHS_L_SEMANTIC_AUDIT_SHA256, MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY, MhsReviewedSemanticApplicationArtifact, ReviewedSemanticEvidenceRecord,
  assertNoContradictorySemanticEvidence, canonicalSemanticPairKey, validateMhsReviewedSemanticApplicationArtifact,
} from "./mhsReviewedSemanticApplicationContract";
import { writeImmutableFileAtomic } from "./mhsReviewImport";

export const MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA = "STHN_TEXT_MODERATION_MHS_SEMANTIC_GROUPING_OVERLAY_V1" as const;
export const MHS_SEMANTIC_GROUPING_OVERLAY_VERSION = "MHS_SEMANTIC_GROUPING_OVERLAY_V1" as const;
export const MHS_SEMANTIC_GROUPING_OVERLAY_POLICY = "STHN_MHS_SEMANTIC_GROUPING_OVERLAY_POLICY_V1" as const;
export const MHS_SEMANTIC_GROUPING_OVERLAY_FILENAME = "mhs-semantic-grouping-overlay-v1.json" as const;
export const MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256 = "da2189ccdae73930cd7025c2ad0a3f8626a8bbd3cffe5b5be9a105fe8e88adf7" as const;
export const MHS_REVIEWED_SEMANTIC_APPLICATION_PAYLOAD_DIGEST = "e2aaf7071bdaa79d0bd99bc0e832484cbecf7f6e94ffc8875c8f0022a81c3199" as const;
export const MHS_CANDIDATE_MEMBERSHIP_DIGEST = "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df" as const;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const readExact = <T>(filename: string, expected: string, validate: (value: T) => void): T => {
  const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expected) throw new Error(`Semantic grouping authority SHA-256 mismatch: ${path.basename(filename)}`);
  const value = JSON.parse(bytes.toString("utf8")) as T; validate(value); return value;
};

export interface AuthoritativeSemanticEdge {
  readonly edgeId: string; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly candidateADigest: string; readonly candidateBDigest: string; readonly semanticRelationship: "NEAR_DUPLICATE";
  readonly semanticScore: number; readonly reviewerId: "a"; readonly humanAuthority: "H"; readonly authorityArtifactSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256;
  readonly applicationContractVersion: typeof MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY; readonly currentReviewFloor: 0.85;
  readonly status: "APPLIED_TO_GROUPING_OVERLAY"; readonly provenanceDigest: string;
}

export interface SemanticGroupingComponent {
  readonly semanticGroupId: string; readonly memberCandidateIds: readonly string[]; readonly edgeIds: readonly string[]; readonly edgePairKeys: readonly string[];
  readonly memberCount: number; readonly edgeCount: number; readonly relationshipCounts: { readonly NEAR_DUPLICATE: number; readonly DUPLICATE: 0 };
  readonly decisionCounts: { readonly BLOCK: number; readonly ALLOW: number }; readonly primaryCategoryCounts: Readonly<Record<string, number>>;
  readonly existingGroupingIntersections: { readonly exactDuplicateGroup: 0; readonly normalizedDuplicateGroup: 0; readonly nearPairGroup: 0; readonly templateFamily: 0; readonly lineageGroup: 0 };
  readonly splitIsolationRequirement: "MUST_REMAIN_TOGETHER_IN_FUTURE_SPLITS";
  readonly pairwiseRelationshipPolicy: "PAIRWISE_RELATIONSHIP_NOT_INFERRED_TRANSITIVELY";
  readonly authorityStatus: "AUTHORITATIVE_GROUPING_OVERLAY"; readonly componentDigest: string;
}

export interface MhsSemanticGroupingOverlayPayload {
  readonly schemaVersion: typeof MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA; readonly overlayVersion: typeof MHS_SEMANTIC_GROUPING_OVERLAY_VERSION; readonly phase: "T6L-6J-N"; readonly policyVersion: typeof MHS_SEMANTIC_GROUPING_OVERLAY_POLICY;
  readonly decision: "AUTHORIZE_REVIEWED_SEMANTIC_EDGE_APPLICATION"; readonly status: "IMMUTABLE_AUTHORITATIVE_EXTERNAL_GROUPING_OVERLAY";
  readonly authorities: { readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly candidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
    readonly candidateMembershipDigest: typeof MHS_CANDIDATE_MEMBERSHIP_DIGEST; readonly candidateIntegrityArtifactSha256: typeof MHS_CANDIDATE_INTEGRITY_SHA256;
    readonly currentSemanticAuditSha256: typeof MHS_L_SEMANTIC_AUDIT_SHA256; readonly hValidatedSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256;
    readonly jValidatedSha256: typeof MHS_K_VALIDATED_SHA256; readonly lAuthorizationSha256: typeof MHS_L_AUTHORIZATION_SHA256; readonly mApplicationContractSha256: typeof MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256;
    readonly mApplicationContractPayloadDigest: typeof MHS_REVIEWED_SEMANTIC_APPLICATION_PAYLOAD_DIGEST };
  readonly appliedEdges: readonly AuthoritativeSemanticEdge[]; readonly components: readonly SemanticGroupingComponent[];
  readonly transitivityPolicy: { readonly connectedForSplitIsolation: true; readonly unreviewedPairRelationshipInferred: false; readonly unreviewedPairKeys: readonly string[] };
  readonly candidateProtection: { readonly admittedCandidateCount: 86; readonly candidateRowsMutated: false; readonly semanticGroupIdWrittenToCandidates: false;
    readonly candidateMergeCount: 0; readonly candidateRemovalCount: 0; readonly moderationDecisionChanges: 0 };
  readonly splitAssignments: readonly []; readonly trainingEligibleCount: 0; readonly frozenBenchmarkAccessed: false; readonly createdAt: string;
}
export interface MhsSemanticGroupingOverlayArtifact extends MhsSemanticGroupingOverlayPayload { readonly overlayPayloadDigest: string }

export interface MhsSemanticGroupingOverlayPaths { readonly candidatePath: string; readonly candidateIntegrityPath: string; readonly currentSemanticAuditPath: string;
  readonly hValidatedPath: string; readonly jValidatedPath: string; readonly lAuthorizationPath: string; readonly mApplicationContractPath: string }
export interface CreateMhsSemanticGroupingOverlayOptions extends MhsSemanticGroupingOverlayPaths { readonly outputDirectory: string; readonly generatedAt?: string;
  readonly publishAtomic?: (temporaryPath: string, targetPath: string) => void }

export const authoritativeSemanticEdgeId = (record: Pick<ReviewedSemanticEvidenceRecord, "pairKey" | "semanticRelationship" | "authorityArtifactSha256">): string =>
  `semantic_edge_${digest([MHS_SEMANTIC_GROUPING_OVERLAY_POLICY, record.pairKey, record.semanticRelationship, record.authorityArtifactSha256])}`;
export const stableSemanticGroupId = (memberCandidateIds: readonly string[], edgeIds: readonly string[]): string => {
  const members = [...memberCandidateIds].sort(); const edges = [...edgeIds].sort();
  if (members.length < 2 || new Set(members).size !== members.length || !edges.length || new Set(edges).size !== edges.length) throw new Error("Invalid semantic component identity inputs");
  return `semantic_${digest([MHS_SEMANTIC_GROUPING_OVERLAY_POLICY, members, edges])}`;
};

export const authorizeReviewedSemanticEdge = (record: ReviewedSemanticEvidenceRecord, humanAuthorityValidated: boolean): AuthoritativeSemanticEdge | null => {
  if (!humanAuthorityValidated) throw new Error("Similarity score alone cannot authorize a semantic edge");
  if (record.semanticRelationship === "RELATED_BUT_DISTINCT" || record.semanticRelationship === "UNRELATED") return null;
  if (record.semanticRelationship === "NEEDS_ADJUDICATION") throw new Error("NEEDS_ADJUDICATION fails closed");
  if (record.authority !== "H" || record.reviewerId !== "a" || record.semanticRelationship !== "NEAR_DUPLICATE" || record.semanticScore < 0.85
    || record.pairKey !== canonicalSemanticPairKey(record.candidateAId, record.candidateBId) || record.authorityArtifactSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256)
    throw new Error("Unauthorized semantic edge application");
  const edgeId = authoritativeSemanticEdgeId(record); const payload = { edgeId, pairKey: record.pairKey, candidateAId: record.candidateAId, candidateBId: record.candidateBId,
    candidateADigest: record.candidateADigest, candidateBDigest: record.candidateBDigest, semanticRelationship: record.semanticRelationship, semanticScore: record.semanticScore,
    reviewerId: record.reviewerId, humanAuthority: record.authority, authorityArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256,
    applicationContractVersion: MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY, currentReviewFloor: 0.85 as const, status: "APPLIED_TO_GROUPING_OVERLAY" as const };
  return { ...payload, provenanceDigest: digest(payload) };
};

export const deriveAuthoritativeSemanticComponents = (edges: readonly AuthoritativeSemanticEdge[]): readonly { readonly memberCandidateIds: readonly string[]; readonly edgeIds: readonly string[]; readonly edgePairKeys: readonly string[] }[] => {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) { if (edge.pairKey !== canonicalSemanticPairKey(edge.candidateAId, edge.candidateBId)) throw new Error("Non-canonical applied semantic edge");
    adjacency.set(edge.candidateAId, new Set([...(adjacency.get(edge.candidateAId) ?? []), edge.candidateBId])); adjacency.set(edge.candidateBId, new Set([...(adjacency.get(edge.candidateBId) ?? []), edge.candidateAId])); }
  const seen = new Set<string>(); const result: { memberCandidateIds: string[]; edgeIds: string[]; edgePairKeys: string[] }[] = [];
  for (const start of [...adjacency.keys()].sort()) { if (seen.has(start)) continue; const pending = [start]; const members: string[] = [];
    while (pending.length) { const current = pending.shift()!; if (seen.has(current)) continue; seen.add(current); members.push(current); pending.push(...[...(adjacency.get(current) ?? [])].sort()); }
    members.sort(); const memberSet = new Set(members); const componentEdges = edges.filter((edge) => memberSet.has(edge.candidateAId) && memberSet.has(edge.candidateBId));
    result.push({ memberCandidateIds: members, edgeIds: componentEdges.map((edge) => edge.edgeId).sort(), edgePairKeys: componentEdges.map((edge) => edge.pairKey).sort() }); }
  return result.sort((a, b) => a.memberCandidateIds[0].localeCompare(b.memberCandidateIds[0]));
};

export const validateMhsSemanticGroupingOverlayArtifact = (artifact: MhsSemanticGroupingOverlayArtifact): void => {
  const { overlayPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA || payload.overlayVersion !== MHS_SEMANTIC_GROUPING_OVERLAY_VERSION || payload.phase !== "T6L-6J-N" || payload.policyVersion !== MHS_SEMANTIC_GROUPING_OVERLAY_POLICY
    || payload.decision !== "AUTHORIZE_REVIEWED_SEMANTIC_EDGE_APPLICATION" || payload.status !== "IMMUTABLE_AUTHORITATIVE_EXTERNAL_GROUPING_OVERLAY"
    || payload.authorities.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.authorities.candidateMembershipDigest !== MHS_CANDIDATE_MEMBERSHIP_DIGEST
    || payload.authorities.candidateIntegrityArtifactSha256 !== MHS_CANDIDATE_INTEGRITY_SHA256 || payload.authorities.currentSemanticAuditSha256 !== MHS_L_SEMANTIC_AUDIT_SHA256
    || payload.authorities.hValidatedSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || payload.authorities.jValidatedSha256 !== MHS_K_VALIDATED_SHA256 || payload.authorities.lAuthorizationSha256 !== MHS_L_AUTHORIZATION_SHA256
    || payload.authorities.mApplicationContractSha256 !== MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256 || payload.appliedEdges.length !== 2 || payload.components.length !== 1
    || payload.components[0].memberCount !== 3 || payload.components[0].edgeCount !== 2 || payload.components[0].edgePairKeys.length !== 2
    || payload.transitivityPolicy.unreviewedPairRelationshipInferred || payload.transitivityPolicy.unreviewedPairKeys.length !== 1
    || payload.candidateProtection.admittedCandidateCount !== 86 || payload.candidateProtection.candidateRowsMutated || payload.candidateProtection.semanticGroupIdWrittenToCandidates
    || payload.candidateProtection.candidateMergeCount !== 0 || payload.candidateProtection.candidateRemovalCount !== 0 || payload.candidateProtection.moderationDecisionChanges !== 0
    || payload.splitAssignments.length || payload.trainingEligibleCount !== 0 || payload.frozenBenchmarkAccessed || !strictInstant(payload.createdAt) || overlayPayloadDigest !== digest(payload))
    throw new Error("Invalid MHS semantic grouping overlay artifact");
  for (const edge of payload.appliedEdges) { const { provenanceDigest, ...edgePayload } = edge; if (edge.status !== "APPLIED_TO_GROUPING_OVERLAY" || provenanceDigest !== digest(edgePayload)) throw new Error("Invalid applied semantic edge provenance"); }
  for (const component of payload.components) { const { componentDigest, ...componentPayload } = component; if (component.semanticGroupId !== stableSemanticGroupId(component.memberCandidateIds, component.edgeIds)
      || componentDigest !== digest(componentPayload) || component.pairwiseRelationshipPolicy !== "PAIRWISE_RELATIONSHIP_NOT_INFERRED_TRANSITIVELY") throw new Error("Invalid semantic grouping component"); }
};

export const createMhsSemanticGroupingOverlay = (options: CreateMhsSemanticGroupingOverlayOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsSemanticGroupingOverlayArtifact } => {
  const candidateBytesBefore = fs.readFileSync(options.candidatePath); const candidate = readExact<MhsCandidateAdmissionArtifact>(options.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const integrity = readExact<MhsCandidateIntegrityAuditArtifact>(options.candidateIntegrityPath, MHS_CANDIDATE_INTEGRITY_SHA256, validateMhsCandidateIntegrityAuditArtifact);
  const current = readExact<MhsReviewFloorSemanticAuditArtifact>(options.currentSemanticAuditPath, MHS_L_SEMANTIC_AUDIT_SHA256, validateMhsReviewFloorSemanticAuditArtifact);
  const h = readExact<MhsSemanticValidatedReviewArtifact>(options.hValidatedPath, MHS_SEMANTIC_I_VALIDATED_SHA256, validateMhsSemanticValidatedReviewArtifact);
  const j = readExact<MhsSemanticBoundaryValidatedArtifact>(options.jValidatedPath, MHS_K_VALIDATED_SHA256, validateMhsSemanticBoundaryValidatedArtifact);
  const l = readExact<MhsReviewFloorAuthorizationArtifact>(options.lAuthorizationPath, MHS_L_AUTHORIZATION_SHA256, validateMhsReviewFloorAuthorizationArtifact);
  const m = readExact<MhsReviewedSemanticApplicationArtifact>(options.mApplicationContractPath, MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256, validateMhsReviewedSemanticApplicationArtifact);
  if (m.applicationContractPayloadDigest !== MHS_REVIEWED_SEMANTIC_APPLICATION_PAYLOAD_DIGEST || candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST
    || m.authorities.candidateMembershipDigest !== MHS_CANDIDATE_MEMBERSHIP_DIGEST || l.authorizationPayloadDigest !== MHS_L_AUTHORIZATION_PAYLOAD_DIGEST || integrity.admittedRowCount !== 86) throw new Error("Semantic grouping payload authority changed");
  const all: ReviewedSemanticEvidenceRecord[] = [...h.records.map((r) => ({ ...r, authority: "H" as const, authorityArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, reviewerId: "a" as const })),
    ...j.records.map((r) => ({ ...r, authority: "J" as const, authorityArtifactSha256: MHS_K_VALIDATED_SHA256, reviewerId: "a" as const }))];
  assertNoContradictorySemanticEvidence(all); const eligible = all.filter((r) => r.semanticRelationship === "NEAR_DUPLICATE");
  if (all.length !== 225 || eligible.length !== 2 || all.some((r) => r.semanticRelationship === "DUPLICATE" || r.semanticRelationship === "NEEDS_ADJUDICATION")) throw new Error("Reviewed semantic authority is not the authorized N edge set");
  const candidates = new Map(candidate.rows.filter((r) => r.candidateAdmitted).map((r) => [r.sourceRowId, r])); const audits = new Map(integrity.rows.map((r) => [r.sourceRowId, r]));
  const findings = new Map(current.findings.map((f) => [canonicalSemanticPairKey(f.candidateAId, f.candidateBId), f]));
  for (const record of eligible) { const a = candidates.get(record.candidateAId); const b = candidates.get(record.candidateBId); const finding = findings.get(record.pairKey);
    if (!a || !b || !finding || a.textDigest !== record.candidateADigest || b.textDigest !== record.candidateBDigest || finding.similarity !== record.semanticScore
      || finding.candidateADigest !== record.candidateADigest || finding.candidateBDigest !== record.candidateBDigest) throw new Error("Stale candidate or semantic score authority"); }
  const expectedM = eligible.map((r) => [r.pairKey, r.semanticScore, r.candidateADigest, r.candidateBDigest]); const actualM = m.nearDuplicatePairs.map((r) => [r.pairKey, r.semanticScore, r.candidateADigest, r.candidateBDigest]);
  if (canonicalJson(expectedM) !== canonicalJson(actualM) || canonicalJson(m.dryRunEdges.map((e) => e.pairKey)) !== canonicalJson(eligible.map((r) => r.pairKey))) throw new Error("M dry-run does not match independently resolved authority");
  const edges = eligible.map((record) => authorizeReviewedSemanticEdge(record, true)!).sort((a, b) => a.pairKey.localeCompare(b.pairKey)); const derivedComponents = deriveAuthoritativeSemanticComponents(edges);
  if (derivedComponents.length !== 1 || derivedComponents[0].memberCandidateIds.length !== 3 || derivedComponents[0].edgeIds.length !== 2) throw new Error("Authorized semantic graph shape changed");
  const members = derivedComponents[0].memberCandidateIds;
  const snapshots = members.map((id) => ({ candidate: candidates.get(id)!, audit: audits.get(id)! }));
  if (snapshots.some(({ candidate: c, audit: a }) => c.reviewerDecision !== "BLOCK" || c.primaryCategory !== "ABUSIVE_OR_HARASSING" || c.trainingEligible || a.exactDuplicateGroupId || a.normalizedDuplicateGroupId || a.lineageGroupId || a.lineageRootId !== c.sourceRowId)) throw new Error("Candidate grouping intersection or moderation authority changed");
  const decisions = { BLOCK: snapshots.filter(({ candidate }) => candidate.reviewerDecision === "BLOCK").length, ALLOW: snapshots.filter(({ candidate }) => candidate.reviewerDecision === "ALLOW").length };
  const primaryCategoryCounts = Object.fromEntries([...new Set(snapshots.map(({ candidate }) => candidate.primaryCategory!))].sort().map((category) => [category, snapshots.filter(({ candidate }) => candidate.primaryCategory === category).length]));
  const semanticGroupId = stableSemanticGroupId(members, derivedComponents[0].edgeIds); const componentBase = { semanticGroupId, memberCandidateIds: members, edgeIds: derivedComponents[0].edgeIds, edgePairKeys: derivedComponents[0].edgePairKeys,
    memberCount: members.length, edgeCount: edges.length, relationshipCounts: { NEAR_DUPLICATE: edges.filter((edge) => edge.semanticRelationship === "NEAR_DUPLICATE").length, DUPLICATE: 0 as const }, decisionCounts: decisions, primaryCategoryCounts,
    existingGroupingIntersections: { exactDuplicateGroup: 0 as const, normalizedDuplicateGroup: 0 as const, nearPairGroup: 0 as const, templateFamily: 0 as const, lineageGroup: 0 as const },
    splitIsolationRequirement: "MUST_REMAIN_TOGETHER_IN_FUTURE_SPLITS" as const, pairwiseRelationshipPolicy: "PAIRWISE_RELATIONSHIP_NOT_INFERRED_TRANSITIVELY" as const,
    authorityStatus: "AUTHORITATIVE_GROUPING_OVERLAY" as const };
  const component: SemanticGroupingComponent = { ...componentBase, componentDigest: digest(componentBase) }; const unreviewedPair = canonicalSemanticPairKey(members[0], members[2]);
  if (all.some((r) => r.pairKey === unreviewedPair)) throw new Error("Unexpected authority exists for transitive boundary pair");
  const createdAt = options.generatedAt ?? new Date().toISOString(); if (!strictInstant(createdAt)) throw new Error("Grouping overlay timestamp must use strict UTC milliseconds");
  const payload: MhsSemanticGroupingOverlayPayload = { schemaVersion: MHS_SEMANTIC_GROUPING_OVERLAY_SCHEMA, overlayVersion: MHS_SEMANTIC_GROUPING_OVERLAY_VERSION, phase: "T6L-6J-N", policyVersion: MHS_SEMANTIC_GROUPING_OVERLAY_POLICY,
    decision: "AUTHORIZE_REVIEWED_SEMANTIC_EDGE_APPLICATION", status: "IMMUTABLE_AUTHORITATIVE_EXTERNAL_GROUPING_OVERLAY", authorities: { candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256,
      candidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST, candidateMembershipDigest: MHS_CANDIDATE_MEMBERSHIP_DIGEST, candidateIntegrityArtifactSha256: MHS_CANDIDATE_INTEGRITY_SHA256,
      currentSemanticAuditSha256: MHS_L_SEMANTIC_AUDIT_SHA256, hValidatedSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, jValidatedSha256: MHS_K_VALIDATED_SHA256, lAuthorizationSha256: MHS_L_AUTHORIZATION_SHA256,
      mApplicationContractSha256: MHS_REVIEWED_SEMANTIC_APPLICATION_SHA256, mApplicationContractPayloadDigest: MHS_REVIEWED_SEMANTIC_APPLICATION_PAYLOAD_DIGEST }, appliedEdges: edges, components: [component],
    transitivityPolicy: { connectedForSplitIsolation: true, unreviewedPairRelationshipInferred: false, unreviewedPairKeys: [unreviewedPair] }, candidateProtection: { admittedCandidateCount: 86,
      candidateRowsMutated: false, semanticGroupIdWrittenToCandidates: false, candidateMergeCount: 0, candidateRemovalCount: 0, moderationDecisionChanges: 0 }, splitAssignments: [], trainingEligibleCount: 0,
    frozenBenchmarkAccessed: false, createdAt };
  const artifact: MhsSemanticGroupingOverlayArtifact = { ...payload, overlayPayloadDigest: digest(payload) }; validateMhsSemanticGroupingOverlayArtifact(artifact);
  if (!candidateBytesBefore.equals(fs.readFileSync(options.candidatePath))) throw new Error("Candidate artifact changed during overlay publication");
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_SEMANTIC_GROUPING_OVERLAY_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized)), artifact };
};
