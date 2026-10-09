import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import {
  MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_AUDIT_FILENAME, MHS_CANDIDATE_PAYLOAD_DIGEST,
  MhsCandidateIntegrityAuditArtifact, MhsCandidateIntegrityAuditRow, validateMhsCandidateIntegrityAuditArtifact,
} from "./mhsCandidateIntegrityAudit";
import {
  MHS_K_ANALYSIS_SHA256, MHS_K_VALIDATED_SHA256, MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME,
  MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME, MhsReviewFloorAuthorizationArtifact,
  MhsReviewFloorSemanticAuditArtifact, validateMhsReviewFloorAuthorizationArtifact,
  validateMhsReviewFloorSemanticAuditArtifact,
} from "./mhsSemanticReviewFloorAuthorization";
import { MhsSemanticAuditArtifact, validateMhsSemanticAuditArtifact } from "./mhsSemanticIntegrityAudit";
import { MhsSemanticBoundaryValidatedArtifact, validateMhsSemanticBoundaryValidatedArtifact } from "./mhsSemanticBoundaryReviewValidation";
import {
  MHS_SEMANTIC_I_PRECISION_SHA256, MHS_SEMANTIC_I_VALIDATED_SHA256,
} from "./mhsSemanticBoundaryReviewPacket";
import { MHS_SEMANTIC_RELATIONSHIP_OUTCOMES, MHS_SEMANTIC_SOURCE_SHA256, MhsSemanticRelationshipOutcome } from "./mhsSemanticReviewPacket";
import {
  MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME,
  MhsSemanticValidatedReviewArtifact, validateMhsSemanticValidatedReviewArtifact,
} from "./mhsSemanticReviewValidation";
import { writeImmutableFileAtomic } from "./mhsReviewImport";

export const MHS_REVIEWED_SEMANTIC_APPLICATION_SCHEMA = "STHN_MHS_REVIEWED_SEMANTIC_APPLICATION_CONTRACT_V1" as const;
export const MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY = "STHN_MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY_V1" as const;
export const MHS_REVIEWED_SEMANTIC_APPLICATION_FILENAME = "mhs-reviewed-semantic-application-contract-v1.json" as const;
export const MHS_CANDIDATE_INTEGRITY_SHA256 = "6d6cb13ddfe6f832fcd9e25899310a62dd0bd1498be022d4f3675d6076188383" as const;
export const MHS_L_AUTHORIZATION_SHA256 = "ba6ea90d6770c38a5912379f98b2937920c5b054a810c982f14dcc8fc19cb864" as const;
export const MHS_L_AUTHORIZATION_PAYLOAD_DIGEST = "51f925c17943ed9db0ecd81b6588ffaece15f217ccfc5d7024c5c146edec5b3f" as const;
export const MHS_L_SEMANTIC_AUDIT_SHA256 = "8d4603f6c51b0acca962f16d4085ddceb3166413f5f8052cd68fac81bf130fe4" as const;
export const MHS_L_SEMANTIC_AUDIT_PAYLOAD_DIGEST = "20fb1fed6b1a9815483983ae972b72029c9d6d163bfbdaf469115beefb7820bb" as const;

export const MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES = {
  DUPLICATE: { edgeEligible: true, futureBehavior: "SHARED_SEMANTIC_COMPONENT_RETAIN_BOTH_ROWS", duplicateGroupEffect: "NO_AUTOMATIC_EFFECT" },
  NEAR_DUPLICATE: { edgeEligible: true, futureBehavior: "SHARED_SEMANTIC_COMPONENT_RETAIN_BOTH_ROWS", duplicateGroupEffect: "NO_EFFECT" },
  RELATED_BUT_DISTINCT: { edgeEligible: false, futureBehavior: "ANALYSIS_EVIDENCE_ONLY", duplicateGroupEffect: "NO_EFFECT" },
  UNRELATED: { edgeEligible: false, futureBehavior: "NO_SEMANTIC_EDGE", duplicateGroupEffect: "NO_EFFECT" },
  NEEDS_ADJUDICATION: { edgeEligible: false, futureBehavior: "FAIL_CLOSED_PENDING_EXPLICIT_ADJUDICATION", duplicateGroupEffect: "NO_EFFECT" },
} as const satisfies Readonly<Record<MhsSemanticRelationshipOutcome, { readonly edgeEligible: boolean; readonly futureBehavior: string; readonly duplicateGroupEffect: string }>>;

export interface ReviewedSemanticEvidenceRecord {
  readonly authority: "H" | "J"; readonly authorityArtifactSha256: string; readonly reviewerId: "a";
  readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string; readonly candidateADigest: string; readonly candidateBDigest: string;
  readonly semanticScore: number; readonly semanticRelationship: MhsSemanticRelationshipOutcome;
}
export interface ProposedSemanticEdge {
  readonly status: "PROPOSED_DRY_RUN_NON_AUTHORITATIVE"; readonly pairKey: string; readonly candidateAId: string; readonly candidateBId: string;
  readonly semanticRelationship: "DUPLICATE" | "NEAR_DUPLICATE"; readonly semanticScore: number; readonly reviewerId: "a";
  readonly sourceAuthority: "H" | "J"; readonly sourceArtifactSha256: string;
}
export interface ProposedSemanticComponent {
  readonly componentId: string; readonly status: "DRY_RUN_NON_AUTHORITATIVE_SPLIT_ISOLATION_COMPONENT";
  readonly memberCandidateIds: readonly string[]; readonly edgePairKeys: readonly string[]; readonly size: number;
}
export interface CandidateGroupingSnapshot {
  readonly candidateId: string; readonly decision: "ALLOW" | "BLOCK"; readonly primaryCategory: string | null; readonly secondaryCategories: readonly string[];
  readonly exactDuplicateGroupId: string | null; readonly normalizedDuplicateGroupId: string | null;
  readonly nearPairGroupId: null; readonly templateFamilyId: null; readonly semanticGroupId: null;
  readonly lineageRootId: string; readonly lineageGroupId: string | null; readonly transformationCount: number; readonly split: "UNASSIGNED";
}

export interface MhsReviewedSemanticApplicationPayload {
  readonly schemaVersion: typeof MHS_REVIEWED_SEMANTIC_APPLICATION_SCHEMA; readonly phase: "T6L-6J-M";
  readonly policyVersion: typeof MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY; readonly status: "IMMUTABLE_NON_MUTATING_DRY_RUN";
  readonly authorities: { readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256; readonly candidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
    readonly candidateMembershipDigest: "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df";
    readonly candidateIntegrityArtifactSha256: typeof MHS_CANDIDATE_INTEGRITY_SHA256; readonly currentSemanticAuditSha256: typeof MHS_L_SEMANTIC_AUDIT_SHA256;
    readonly historicalSemanticAuditSha256: typeof MHS_SEMANTIC_SOURCE_SHA256; readonly hValidatedSha256: typeof MHS_SEMANTIC_I_VALIDATED_SHA256;
    readonly hPrecisionSha256: typeof MHS_SEMANTIC_I_PRECISION_SHA256; readonly jValidatedSha256: typeof MHS_K_VALIDATED_SHA256;
    readonly jAnalysisSha256: typeof MHS_K_ANALYSIS_SHA256; readonly lAuthorizationSha256: typeof MHS_L_AUTHORIZATION_SHA256 };
  readonly relationshipRules: typeof MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES;
  readonly edgeAuthorityRequirements: readonly string[];
  readonly transitivityPolicy: { readonly pairRelationshipDoesNotPropagate: true; readonly connectedComponentsUsedForFutureSplitIsolationOnly: true;
    readonly allPairsInsideComponentDeclaredEquivalent: false };
  readonly contradictionPolicy: { readonly exactPairContradiction: "BLOCK_APPLICATION_PENDING_EXPLICIT_ADJUDICATION";
    readonly duplicateAuthorityReplay: "REJECT"; readonly staleCandidateIdentity: "REJECT";
    readonly transitiveComponentTension: "SURFACE_WARNING_AND_BLOCK_FINAL_GROUPING_PENDING_EXPLICIT_REVIEW" };
  readonly groupTypeInteractionPolicy: { readonly nearPairGroupId: string; readonly templateFamilyId: string; readonly duplicateGroupId: string;
    readonly semanticGroupId: string; readonly lineageRootId: string };
  readonly futureSplitIsolationPolicy: { readonly assignmentCreated: false; readonly rule: "ALL_MEMBERS_OF_CONNECTED_LINEAGE_AND_GROUPING_COMPONENT_MUST_SHARE_ONE_FUTURE_SPLIT" };
  readonly knownReviewedSummary: Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  readonly nearDuplicatePairs: readonly ReviewedSemanticEvidenceRecord[]; readonly dryRunEdges: readonly ProposedSemanticEdge[];
  readonly affectedCandidates: readonly CandidateGroupingSnapshot[]; readonly dryRunComponents: readonly ProposedSemanticComponent[];
  readonly dryRunImpact: { readonly proposedEdgeCount: 2; readonly affectedCandidateCount: 3; readonly componentCount: 1;
    readonly componentSizeDistribution: { readonly "3": 1 }; readonly decisionCounts: { readonly BLOCK: 3; readonly ALLOW: 0 };
    readonly primaryCategoryCounts: { readonly ABUSIVE_OR_HARASSING: 3 }; readonly allowBlockCollisionCount: 0;
    readonly primaryCategoryCollisionCount: 0; readonly fullClassificationSetCollisionCount: number;
    readonly existingGroupIntersectionCount: 0; readonly transitiveTensionCount: 0 };
  readonly candidateMutationCount: 0; readonly semanticGroupIdAssignments: readonly []; readonly duplicateGroupIdAssignments: readonly [];
  readonly candidateMergeCount: 0; readonly candidateRemovalCount: 0; readonly splitAssignments: readonly []; readonly trainingEligibleCount: 0;
  readonly frozenBenchmarkAccessed: false; readonly generatedAt: string;
}
export interface MhsReviewedSemanticApplicationArtifact extends MhsReviewedSemanticApplicationPayload { readonly applicationContractPayloadDigest: string; }

export interface MhsReviewedSemanticApplicationPaths {
  readonly candidatePath: string; readonly candidateIntegrityPath: string; readonly currentSemanticAuditPath: string; readonly historicalSemanticAuditPath: string;
  readonly hValidatedPath: string; readonly hPrecisionPath: string; readonly jValidatedPath: string; readonly jAnalysisPath: string; readonly lAuthorizationPath: string;
}
export interface CreateMhsReviewedSemanticApplicationOptions extends MhsReviewedSemanticApplicationPaths { readonly outputDirectory: string; readonly generatedAt?: string;
  readonly publishAtomic?: (temporaryPath: string, targetPath: string) => void; }

const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const digest = (payload: unknown): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));
const readExact = <T>(filename: string, expectedSha: string, validate?: (value: T) => void): T => { const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expectedSha) throw new Error(`Semantic application authority SHA-256 mismatch: ${path.basename(filename)}`); const value = JSON.parse(bytes.toString("utf8")) as T; validate?.(value); return value; };
export const canonicalSemanticPairKey = (candidateAId: string, candidateBId: string): string => { if (!candidateAId || !candidateBId || candidateAId === candidateBId) throw new Error("Semantic edge requires two distinct candidate identities"); return [candidateAId, candidateBId].sort().join("::"); };

export const proposeReviewedSemanticEdge = (record: ReviewedSemanticEvidenceRecord, humanAuthorityValidated: boolean): ProposedSemanticEdge | null => {
  if (!humanAuthorityValidated) throw new Error("Similarity score alone cannot create a semantic edge");
  if (record.pairKey !== canonicalSemanticPairKey(record.candidateAId, record.candidateBId) || record.reviewerId !== "a") throw new Error("Semantic edge lacks canonical reviewed identity authority");
  const rule = MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES[record.semanticRelationship]; if (!rule.edgeEligible) return null;
  return { status: "PROPOSED_DRY_RUN_NON_AUTHORITATIVE", pairKey: record.pairKey, candidateAId: record.candidateAId, candidateBId: record.candidateBId,
    semanticRelationship: record.semanticRelationship as "DUPLICATE" | "NEAR_DUPLICATE", semanticScore: record.semanticScore, reviewerId: "a",
    sourceAuthority: record.authority, sourceArtifactSha256: record.authorityArtifactSha256 };
};

export const assertNoContradictorySemanticEvidence = (records: readonly ReviewedSemanticEvidenceRecord[]): void => {
  const seen = new Map<string, ReviewedSemanticEvidenceRecord>(); for (const record of records) { const prior = seen.get(record.pairKey); if (!prior) { seen.set(record.pairKey, record); continue; }
    if (prior.semanticRelationship !== record.semanticRelationship) throw new Error(`Contradictory authoritative semantic outcomes for ${record.pairKey}`);
    throw new Error(`Duplicate semantic authority replay for ${record.pairKey}`);
  }
};

export const connectedSemanticComponents = (edges: readonly ProposedSemanticEdge[]): readonly ProposedSemanticComponent[] => {
  const adjacency = new Map<string, Set<string>>(); for (const edge of edges) { const key = canonicalSemanticPairKey(edge.candidateAId, edge.candidateBId); if (key !== edge.pairKey) throw new Error("Non-canonical semantic edge");
    adjacency.set(edge.candidateAId, new Set([...(adjacency.get(edge.candidateAId) ?? []), edge.candidateBId])); adjacency.set(edge.candidateBId, new Set([...(adjacency.get(edge.candidateBId) ?? []), edge.candidateAId])); }
  const visited = new Set<string>(); const components: ProposedSemanticComponent[] = [];
  for (const start of [...adjacency.keys()].sort()) { if (visited.has(start)) continue; const pending = [start]; const members: string[] = []; while (pending.length) { const current = pending.shift()!; if (visited.has(current)) continue; visited.add(current); members.push(current); pending.push(...[...(adjacency.get(current) ?? [])].filter((id) => !visited.has(id)).sort()); }
    members.sort(); const memberSet = new Set(members); const pairKeys = [...new Set(edges.filter((edge) => memberSet.has(edge.candidateAId) && memberSet.has(edge.candidateBId)).map((edge) => edge.pairKey))].sort();
    components.push({ componentId: `DRY_RUN_NON_AUTHORITATIVE_semantic_${crypto.createHash("sha256").update(canonicalJson(members)).digest("hex")}`,
      status: "DRY_RUN_NON_AUTHORITATIVE_SPLIT_ISOLATION_COMPONENT", memberCandidateIds: members, edgePairKeys: pairKeys, size: members.length }); }
  return components.sort((a, b) => a.memberCandidateIds[0].localeCompare(b.memberCandidateIds[0]));
};

export const validateMhsReviewedSemanticApplicationArtifact = (artifact: MhsReviewedSemanticApplicationArtifact): void => { const { applicationContractPayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_REVIEWED_SEMANTIC_APPLICATION_SCHEMA || payload.phase !== "T6L-6J-M" || payload.policyVersion !== MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY
    || payload.status !== "IMMUTABLE_NON_MUTATING_DRY_RUN" || payload.authorities.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256
    || payload.authorities.candidateMembershipDigest !== "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df"
    || payload.authorities.candidateIntegrityArtifactSha256 !== MHS_CANDIDATE_INTEGRITY_SHA256 || payload.authorities.currentSemanticAuditSha256 !== MHS_L_SEMANTIC_AUDIT_SHA256
    || payload.authorities.hValidatedSha256 !== MHS_SEMANTIC_I_VALIDATED_SHA256 || payload.authorities.jValidatedSha256 !== MHS_K_VALIDATED_SHA256 || payload.authorities.lAuthorizationSha256 !== MHS_L_AUTHORIZATION_SHA256
    || payload.nearDuplicatePairs.length !== 2 || payload.dryRunEdges.length !== 2 || payload.affectedCandidates.length !== 3 || payload.dryRunComponents.length !== 1 || payload.dryRunComponents[0].size !== 3
    || payload.dryRunImpact.proposedEdgeCount !== 2 || payload.dryRunImpact.affectedCandidateCount !== 3 || payload.dryRunImpact.componentCount !== 1 || payload.dryRunImpact.allowBlockCollisionCount !== 0
    || payload.dryRunImpact.fullClassificationSetCollisionCount !== 1
    || payload.candidateMutationCount !== 0 || payload.semanticGroupIdAssignments.length || payload.duplicateGroupIdAssignments.length || payload.candidateMergeCount !== 0 || payload.candidateRemovalCount !== 0
    || payload.splitAssignments.length || payload.trainingEligibleCount !== 0 || payload.frozenBenchmarkAccessed || !strictInstant(payload.generatedAt)
    || applicationContractPayloadDigest !== digest(payload)) throw new Error("Invalid reviewed semantic application contract artifact");
};

export const createMhsReviewedSemanticApplicationContract = (options: CreateMhsReviewedSemanticApplicationOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsReviewedSemanticApplicationArtifact } => {
  const candidate = readExact<MhsCandidateAdmissionArtifact>(options.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, validateMhsCandidateAdmissionArtifact);
  const integrity = readExact<MhsCandidateIntegrityAuditArtifact>(options.candidateIntegrityPath, MHS_CANDIDATE_INTEGRITY_SHA256, validateMhsCandidateIntegrityAuditArtifact);
  const currentSemantic = readExact<MhsReviewFloorSemanticAuditArtifact>(options.currentSemanticAuditPath, MHS_L_SEMANTIC_AUDIT_SHA256, validateMhsReviewFloorSemanticAuditArtifact);
  readExact<MhsSemanticAuditArtifact>(options.historicalSemanticAuditPath, MHS_SEMANTIC_SOURCE_SHA256, validateMhsSemanticAuditArtifact);
  const h = readExact<MhsSemanticValidatedReviewArtifact>(options.hValidatedPath, MHS_SEMANTIC_I_VALIDATED_SHA256, validateMhsSemanticValidatedReviewArtifact);
  readExact<Record<string, unknown>>(options.hPrecisionPath, MHS_SEMANTIC_I_PRECISION_SHA256);
  const j = readExact<MhsSemanticBoundaryValidatedArtifact>(options.jValidatedPath, MHS_K_VALIDATED_SHA256, validateMhsSemanticBoundaryValidatedArtifact);
  readExact<Record<string, unknown>>(options.jAnalysisPath, MHS_K_ANALYSIS_SHA256);
  const authorization = readExact<MhsReviewFloorAuthorizationArtifact>(options.lAuthorizationPath, MHS_L_AUTHORIZATION_SHA256, validateMhsReviewFloorAuthorizationArtifact);
  if (currentSemantic.semanticAuditPayloadDigest !== MHS_L_SEMANTIC_AUDIT_PAYLOAD_DIGEST || authorization.authorizationPayloadDigest !== MHS_L_AUTHORIZATION_PAYLOAD_DIGEST
    || candidate.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || integrity.admittedRowCount !== 86 || candidate.rows.some((row) => row.trainingEligible)) throw new Error("Semantic application payload authority changed");
  const all: ReviewedSemanticEvidenceRecord[] = [...h.records.map((record) => ({ authority: "H" as const, authorityArtifactSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, reviewerId: "a" as const,
    pairKey: record.pairKey, candidateAId: record.candidateAId, candidateBId: record.candidateBId, candidateADigest: record.candidateADigest, candidateBDigest: record.candidateBDigest,
    semanticScore: record.semanticScore, semanticRelationship: record.semanticRelationship })), ...j.records.map((record) => ({ authority: "J" as const, authorityArtifactSha256: MHS_K_VALIDATED_SHA256,
    reviewerId: "a" as const, pairKey: record.pairKey, candidateAId: record.candidateAId, candidateBId: record.candidateBId, candidateADigest: record.candidateADigest,
    candidateBDigest: record.candidateBDigest, semanticScore: record.semanticScore, semanticRelationship: record.semanticRelationship }))];
  assertNoContradictorySemanticEvidence(all); const near = all.filter((record) => record.semanticRelationship === "NEAR_DUPLICATE"); const duplicates = all.filter((record) => record.semanticRelationship === "DUPLICATE");
  if (all.length !== 225 || near.length !== 2 || duplicates.length !== 0) throw new Error("Current reviewed semantic findings changed");
  const candidateById = new Map(candidate.rows.filter((row) => row.candidateAdmitted).map((row) => [row.sourceRowId, row])); const integrityById = new Map(integrity.rows.map((row) => [row.sourceRowId, row]));
  const scoreByPair = new Map(currentSemantic.findings.map((finding) => [canonicalSemanticPairKey(finding.candidateAId, finding.candidateBId), finding]));
  for (const record of near) { const a = candidateById.get(record.candidateAId); const b = candidateById.get(record.candidateBId); const finding = scoreByPair.get(record.pairKey);
    if (!a || !b || !finding || a.textDigest !== record.candidateADigest || b.textDigest !== record.candidateBDigest || finding.similarity !== record.semanticScore
      || finding.candidateADigest !== record.candidateADigest || finding.candidateBDigest !== record.candidateBDigest) throw new Error(`Stale candidate or semantic identity for ${record.pairKey}`); }
  const edges = near.map((record) => proposeReviewedSemanticEdge(record, true)!); const components = connectedSemanticComponents(edges); const affectedIds = [...new Set(edges.flatMap((edge) => [edge.candidateAId, edge.candidateBId]))].sort();
  const snapshots = affectedIds.map((candidateId): CandidateGroupingSnapshot => { const row = candidateById.get(candidateId)!; const audit = integrityById.get(candidateId)!; return { candidateId,
    decision: row.reviewerDecision as "ALLOW" | "BLOCK", primaryCategory: row.primaryCategory, secondaryCategories: row.secondaryCategories,
    exactDuplicateGroupId: audit.exactDuplicateGroupId, normalizedDuplicateGroupId: audit.normalizedDuplicateGroupId, nearPairGroupId: null, templateFamilyId: null,
    semanticGroupId: null, lineageRootId: audit.lineageRootId, lineageGroupId: audit.lineageGroupId, transformationCount: audit.transformationCount, split: "UNASSIGNED" }; });
  const fullSets = new Set(snapshots.map((row) => canonicalJson([row.primaryCategory, ...row.secondaryCategories].sort()))); const existingIntersections = snapshots.filter((row) => row.exactDuplicateGroupId || row.normalizedDuplicateGroupId || row.lineageGroupId || row.nearPairGroupId || row.templateFamilyId).length;
  const componentByCandidate = new Map(components.flatMap((component) => component.memberCandidateIds.map((id) => [id, component.componentId] as const)));
  const transitiveTensions = all.filter((record) => !MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES[record.semanticRelationship].edgeEligible
    && componentByCandidate.get(record.candidateAId) && componentByCandidate.get(record.candidateAId) === componentByCandidate.get(record.candidateBId)
    && (record.semanticRelationship === "UNRELATED" || record.semanticRelationship === "NEEDS_ADJUDICATION"));
  if (edges.length !== 2 || affectedIds.length !== 3 || components.length !== 1 || components[0].size !== 3 || snapshots.some((row) => row.decision !== "BLOCK" || row.primaryCategory !== "ABUSIVE_OR_HARASSING")
    || existingIntersections !== 0 || transitiveTensions.length !== 0) throw new Error("Semantic dry-run graph authority changed");
  const counts = Object.fromEntries(MHS_SEMANTIC_RELATIONSHIP_OUTCOMES.map((outcome) => [outcome, all.filter((record) => record.semanticRelationship === outcome).length])) as Readonly<Record<MhsSemanticRelationshipOutcome, number>>;
  const generatedAt = options.generatedAt ?? new Date().toISOString(); if (!strictInstant(generatedAt)) throw new Error("Application contract timestamp must use strict UTC milliseconds");
  const payload: MhsReviewedSemanticApplicationPayload = { schemaVersion: MHS_REVIEWED_SEMANTIC_APPLICATION_SCHEMA, phase: "T6L-6J-M", policyVersion: MHS_REVIEWED_SEMANTIC_APPLICATION_POLICY,
    status: "IMMUTABLE_NON_MUTATING_DRY_RUN", authorities: { candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, candidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST,
      candidateMembershipDigest: "561e0bd36de7c7fcfb6f698a1fe41fad1a43eeb3a040f3b92e117a4ebd65d8df",
      candidateIntegrityArtifactSha256: MHS_CANDIDATE_INTEGRITY_SHA256, currentSemanticAuditSha256: MHS_L_SEMANTIC_AUDIT_SHA256, historicalSemanticAuditSha256: MHS_SEMANTIC_SOURCE_SHA256,
      hValidatedSha256: MHS_SEMANTIC_I_VALIDATED_SHA256, hPrecisionSha256: MHS_SEMANTIC_I_PRECISION_SHA256, jValidatedSha256: MHS_K_VALIDATED_SHA256,
      jAnalysisSha256: MHS_K_ANALYSIS_SHA256, lAuthorizationSha256: MHS_L_AUTHORIZATION_SHA256 }, relationshipRules: MHS_SEMANTIC_RELATIONSHIP_APPLICATION_RULES,
    edgeAuthorityRequirements: ["Canonical unordered pair identity", "Validated Reviewer A human-review artifact", "DUPLICATE or NEAR_DUPLICATE human outcome", "Exact candidate ID and text-digest match",
      "Bound source semantic artifact identity and unchanged score", "No unresolved adjudication", "No contradictory or replayed pair authority"],
    transitivityPolicy: { pairRelationshipDoesNotPropagate: true, connectedComponentsUsedForFutureSplitIsolationOnly: true, allPairsInsideComponentDeclaredEquivalent: false },
    contradictionPolicy: { exactPairContradiction: "BLOCK_APPLICATION_PENDING_EXPLICIT_ADJUDICATION", duplicateAuthorityReplay: "REJECT", staleCandidateIdentity: "REJECT",
      transitiveComponentTension: "SURFACE_WARNING_AND_BLOCK_FINAL_GROUPING_PENDING_EXPLICIT_REVIEW" },
    groupTypeInteractionPolicy: { nearPairGroupId: "SOURCE_NATIVE_POLICY_BOUNDARY_PAIR_ONLY", templateFamilyId: "SOURCE_OR_GENERATOR_TEMPLATE_PROVENANCE_ONLY",
      duplicateGroupId: "EXACT_OR_NORMALIZED_TEXT_IDENTITY_ONLY", semanticGroupId: "FUTURE_CONTAINER_FOR_VALIDATED_DUPLICATE_NEAR_DUPLICATE_CONNECTIVITY",
      lineageRootId: "SOURCE_AND_TRANSFORMATION_LINEAGE_ONLY" }, futureSplitIsolationPolicy: { assignmentCreated: false, rule: "ALL_MEMBERS_OF_CONNECTED_LINEAGE_AND_GROUPING_COMPONENT_MUST_SHARE_ONE_FUTURE_SPLIT" },
    knownReviewedSummary: counts, nearDuplicatePairs: near, dryRunEdges: edges, affectedCandidates: snapshots, dryRunComponents: components,
    dryRunImpact: { proposedEdgeCount: 2, affectedCandidateCount: 3, componentCount: 1, componentSizeDistribution: { "3": 1 }, decisionCounts: { BLOCK: 3, ALLOW: 0 },
      primaryCategoryCounts: { ABUSIVE_OR_HARASSING: 3 }, allowBlockCollisionCount: 0, primaryCategoryCollisionCount: 0, fullClassificationSetCollisionCount: fullSets.size > 1 ? 1 : 0,
      existingGroupIntersectionCount: existingIntersections, transitiveTensionCount: transitiveTensions.length }, candidateMutationCount: 0, semanticGroupIdAssignments: [], duplicateGroupIdAssignments: [], candidateMergeCount: 0,
    candidateRemovalCount: 0, splitAssignments: [], trainingEligibleCount: 0, frozenBenchmarkAccessed: false, generatedAt };
  const artifact: MhsReviewedSemanticApplicationArtifact = { ...payload, applicationContractPayloadDigest: digest(payload) }; validateMhsReviewedSemanticApplicationArtifact(artifact);
  const serialized = canonicalJson(artifact); const artifactPath = path.join(options.outputDirectory, MHS_REVIEWED_SEMANTIC_APPLICATION_FILENAME); writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized)), artifact };
};

export const MHS_REVIEWED_SEMANTIC_APPLICATION_DEFAULT_FILENAMES = { candidateIntegrity: MHS_CANDIDATE_AUDIT_FILENAME, currentSemanticAudit: MHS_REVIEW_FLOOR_SEMANTIC_AUDIT_FILENAME,
  hValidated: MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME, hPrecision: MHS_SEMANTIC_PRECISION_FILENAME, lAuthorization: MHS_REVIEW_FLOOR_AUTHORIZATION_FILENAME } as const;
