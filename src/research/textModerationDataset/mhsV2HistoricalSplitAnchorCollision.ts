import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MHS_INTERNAL_TEST_FREEZE_SHA256, MHS_SPLIT_SHA256 } from "./mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256,
  MhsV2JoinedCalibrationRow,
  MhsV2SemanticCalibrationEvaluationArtifact,
  MhsV2SemanticCalibrationEvaluationCertification,
  MhsV2SemanticCalibrationEvaluationInputs,
  createMhsV2SemanticCalibrationEvaluation,
  reconcileMhsV2SemanticCalibrationRows,
  validateMhsV2SemanticCalibrationEvaluation,
  validateMhsV2SemanticCalibrationEvaluationCertification,
} from "./mhsV2SemanticCalibrationEvaluation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
} from "./mhsV2SemanticCalibrationReviewValidation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256,
} from "./mhsV2SemanticCalibrationExecution";
import {
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
} from "./mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST,
  MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST,
  MHS_V2_EXPANSION_CONSOLIDATION_SHA256,
  MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST,
  MhsV2ExpansionConsolidationArtifact,
  validateMhsV2ExpansionConsolidation,
} from "./mhsV2ExpansionConsolidation";
import { MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";

export const MHS_V2_COLLISION_POLICY_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_HISTORICAL_SPLIT_ANCHOR_COLLISION_POLICY_V1" as const;
export const MHS_V2_COLLISION_ANALYSIS_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_HISTORICAL_SPLIT_ANCHOR_COLLISION_ANALYSIS_V1" as const;
export const MHS_V2_COLLISION_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_HISTORICAL_SPLIT_ANCHOR_COLLISION_CERTIFICATION_V1" as const;
export const MHS_V2_COLLISION_VERSION = "MHS_V2_HISTORICAL_SPLIT_ANCHOR_COLLISION_V1" as const;
export const MHS_V2_COLLISION_POLICY_FILENAME = "mhs-v2-historical-split-anchor-collision-policy-v1.json" as const;
export const MHS_V2_COLLISION_ANALYSIS_FILENAME = "mhs-v2-historical-split-anchor-collision-analysis-v1.json" as const;
export const MHS_V2_COLLISION_CERTIFICATION_FILENAME = "mhs-v2-historical-split-anchor-collision-certification-v1.json" as const;
export const MHS_V2_COLLISION_POLICY_SHA256 = "0637ec5513e4fe102948ef27e1a94359afb1872a8c3f7f9b2fd7c7b5b26d6e71" as const;
export const MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST = "9c8cc06bb24d8563e904d8a06f6f218b181a75e4538782dabbc64351964a79fd" as const;
export const MHS_V2_COLLISION_ANALYSIS_SHA256 = "7c5e88b6fb33106f788e6babf17108f0c0bb50d14333cbdcf1573414b042a25c" as const;
export const MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST = "5f58a3b4961f09933792b7d80c218f7b2015a9ca38630b55e8eed94f74c96cac" as const;
export const MHS_V2_COLLISION_CERTIFICATION_SHA256 = "1f6e9a7095302a7384f1550a592f6b163a590a3f1adb90f917f5602f194ce209" as const;
export const MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST = "ea0bfcb65e8daca83938922dae20d2a88759992d1d4f5c5b1277b23a7d772935" as const;
export const MHS_V2_COLLISION_REASON = "CONFLICTING_FROZEN_HISTORICAL_SPLIT_ANCHORS" as const;
export const MHS_V2_COLLISION_DISPOSITION = "EXCLUDE_FROM_TRAIN_AND_VALIDATION_PRESERVE_RESEARCH_UNIVERSE" as const;
export const MHS_V2_COLLISION_CANDIDATE_ID = "src_d563548ab4148246aa543b34c959b4c82e5c86a5a1a6f922fc3eba3ba7eebb72" as const;
export const MHS_V2_COLLISION_FROZEN_AT = "2026-09-20T12:00:00.000Z" as const;

export type HistoricalDevelopmentSplit = "TRAIN" | "VALIDATION";
export interface HistoricalAnchor {
  readonly reviewRowNumber: number;
  readonly relationship: "DUPLICATE" | "NEAR_DUPLICATE";
  readonly v2CandidateId: string;
  readonly historicalCandidateId: string;
  readonly historicalComponentId: string;
  readonly frozenSplit: HistoricalDevelopmentSplit;
  readonly pairId: string;
}
export interface HistoricalAnchorConstraint {
  readonly v2CandidateId: string;
  readonly anchors: readonly HistoricalAnchor[];
  readonly frozenSplits: readonly HistoricalDevelopmentSplit[];
  readonly collision: boolean;
}

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const parseArtifact = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const isDuplicateLike = (row: MhsV2JoinedCalibrationRow): row is MhsV2JoinedCalibrationRow & { relationship: "DUPLICATE" | "NEAR_DUPLICATE" } => row.relationship === "DUPLICATE" || row.relationship === "NEAR_DUPLICATE";

export const deriveHistoricalAnchorConstraints = (
  rows: readonly MhsV2JoinedCalibrationRow[],
  memberships: readonly { readonly candidateId: string; readonly split: "TRAIN" | "VALIDATION" | "INTERNAL_TEST"; readonly unionComponentId: string }[],
): readonly HistoricalAnchorConstraint[] => {
  const membershipById = new Map(memberships.map((member) => [member.candidateId, member]));
  const anchors = rows.filter((row) => row.scope === "B" && isDuplicateLike(row)).map((row): HistoricalAnchor => {
    const historical = membershipById.get(row.candidateBId);
    if (!historical) throw new Error(`A1R-CQ missing historical anchor membership for review row ${row.reviewRowNumber}`);
    if (historical.split === "INTERNAL_TEST") throw new Error("A1R-CQ protected INTERNAL_TEST anchor encountered; fail closed without reading content");
    return { reviewRowNumber: row.reviewRowNumber, relationship: row.relationship as "DUPLICATE" | "NEAR_DUPLICATE", v2CandidateId: row.candidateAId, historicalCandidateId: row.candidateBId, historicalComponentId: historical.unionComponentId, frozenSplit: historical.split, pairId: row.pairId };
  });
  const byCandidate = new Map<string, HistoricalAnchor[]>();
  anchors.forEach((anchor) => byCandidate.set(anchor.v2CandidateId, [...(byCandidate.get(anchor.v2CandidateId) ?? []), anchor]));
  return [...byCandidate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([v2CandidateId, candidateAnchors]) => {
    const frozenSplits = [...new Set(candidateAnchors.map((anchor) => anchor.frozenSplit))].sort() as HistoricalDevelopmentSplit[];
    return { v2CandidateId, anchors: [...candidateAnchors].sort((left, right) => left.reviewRowNumber - right.reviewRowNumber), frozenSplits, collision: frozenSplits.length > 1 };
  });
};

export const collisionQuarantineAppliesToComponent = (componentMemberCandidateIds: readonly string[], collisionCandidateIds: ReadonlySet<string>): boolean => componentMemberCandidateIds.some((candidateId) => collisionCandidateIds.has(candidateId));

interface CollisionAuthorities {
  readonly calibrationPolicySha256: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256;
  readonly calibrationPolicyPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST;
  readonly calibrationMembershipSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256;
  readonly calibrationMembershipPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST;
  readonly calibrationMembershipDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST;
  readonly completedReviewSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256;
  readonly canonicalReviewPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST;
  readonly reviewCertificationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256;
  readonly reviewCertificationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly evaluationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256;
  readonly evaluationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST;
  readonly evaluationCertificationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256;
  readonly evaluationCertificationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly consolidationSha256: typeof MHS_V2_EXPANSION_CONSOLIDATION_SHA256;
  readonly consolidationPayloadDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST;
  readonly consolidationMembershipDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST;
  readonly consolidationReviewerDigest: typeof MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST;
  readonly historicalSplitManifestSha256: typeof MHS_SPLIT_SHA256;
  readonly internalTestFreezeMetadataSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256;
}
const authorities = (): CollisionAuthorities => ({
  calibrationPolicySha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, calibrationPolicyPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  calibrationMembershipSha256: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256, calibrationMembershipPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, calibrationMembershipDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST,
  completedReviewSha256: MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, canonicalReviewPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
  reviewCertificationSha256: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256, reviewCertificationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST,
  evaluationSha256: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256, evaluationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST,
  evaluationCertificationSha256: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256, evaluationCertificationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  consolidationSha256: MHS_V2_EXPANSION_CONSOLIDATION_SHA256, consolidationPayloadDigest: MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST, consolidationMembershipDigest: MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST, consolidationReviewerDigest: MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST,
  historicalSplitManifestSha256: MHS_SPLIT_SHA256, internalTestFreezeMetadataSha256: MHS_INTERNAL_TEST_FREEZE_SHA256,
});

export interface MhsV2CollisionInputs {
  readonly evaluationInputs: MhsV2SemanticCalibrationEvaluationInputs;
  readonly evaluationBytes: Buffer;
  readonly evaluationCertificationBytes: Buffer;
  readonly consolidationBytes: Buffer;
  readonly historicalSplitManifestBytes: Buffer;
  readonly internalTestFreezeMetadataBytes: Buffer;
}

interface VerifiedCollisionInputs {
  readonly joined: readonly MhsV2JoinedCalibrationRow[];
  readonly evaluation: MhsV2SemanticCalibrationEvaluationArtifact;
  readonly consolidation: MhsV2ExpansionConsolidationArtifact;
  readonly splitManifest: MhsSplitManifestArtifact;
}

const verifyInputs = (inputs: MhsV2CollisionInputs): VerifiedCollisionInputs => {
  if (sha256(inputs.evaluationBytes) !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256) throw new Error("A1R-CQ evaluation SHA mismatch");
  const evaluation = parseArtifact<MhsV2SemanticCalibrationEvaluationArtifact>(inputs.evaluationBytes); validateMhsV2SemanticCalibrationEvaluation(evaluation);
  if (evaluation.evaluationPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST || evaluation.policyConclusion !== "FAIL_0_85_REQUIRES_SEPARATE_SUCCESSOR_CALIBRATION") throw new Error("A1R-CQ evaluation authority mismatch");
  if (canonicalJson(createMhsV2SemanticCalibrationEvaluation(inputs.evaluationInputs)) !== canonicalJson(evaluation)) throw new Error("A1R-CQ evaluation replay mismatch");
  if (sha256(inputs.evaluationCertificationBytes) !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256) throw new Error("A1R-CQ evaluation certification SHA mismatch");
  const evaluationCertification = parseArtifact<MhsV2SemanticCalibrationEvaluationCertification>(inputs.evaluationCertificationBytes); validateMhsV2SemanticCalibrationEvaluationCertification(evaluationCertification);
  if (evaluationCertification.certificationPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST || evaluationCertification.authorities.evaluationArtifactSha256 !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256) throw new Error("A1R-CQ evaluation certification authority mismatch");
  if (sha256(inputs.consolidationBytes) !== MHS_V2_EXPANSION_CONSOLIDATION_SHA256) throw new Error("A1R-CQ consolidation SHA mismatch");
  const consolidation = parseArtifact<MhsV2ExpansionConsolidationArtifact>(inputs.consolidationBytes); validateMhsV2ExpansionConsolidation(consolidation);
  if (sha256(inputs.historicalSplitManifestBytes) !== MHS_SPLIT_SHA256) throw new Error("A1R-CQ historical split manifest SHA mismatch");
  const splitManifest = parseArtifact<MhsSplitManifestArtifact>(inputs.historicalSplitManifestBytes); validateMhsSplitManifestArtifact(splitManifest);
  if (sha256(inputs.internalTestFreezeMetadataBytes) !== MHS_INTERNAL_TEST_FREEZE_SHA256) throw new Error("A1R-CQ INTERNAL_TEST freeze metadata SHA mismatch");
  return { joined: reconcileMhsV2SemanticCalibrationRows(inputs.evaluationInputs), evaluation, consolidation, splitManifest };
};

interface CollisionRule {
  readonly anchorSetDefinition: "AUTHORITATIVE_SPLIT_BINDING_HISTORICAL_ANCHORS_REACHABLE_FROM_NEW_COMPONENT";
  readonly zeroAnchorDisposition: "NO_HISTORICAL_PLACEMENT_CONSTRAINT";
  readonly oneSplitDisposition: "COLOCATE_WITH_FROZEN_DEVELOPMENT_SPLIT_SUBJECT_TO_LATER_CONTAMINATION_AND_EXCLUSION_RULES";
  readonly incompatibleDevelopmentSplitsDisposition: typeof MHS_V2_COLLISION_DISPOSITION;
  readonly reasonCode: typeof MHS_V2_COLLISION_REASON;
  readonly propagation: "ANY_COLLISION_MEMBER_QUARANTINES_COMPLETE_DERIVED_NEW_DATA_COMPONENT";
  readonly internalTestDestinationProhibited: true;
  readonly historicalMovementProhibited: true;
}
const collisionRule = (): CollisionRule => ({ anchorSetDefinition: "AUTHORITATIVE_SPLIT_BINDING_HISTORICAL_ANCHORS_REACHABLE_FROM_NEW_COMPONENT", zeroAnchorDisposition: "NO_HISTORICAL_PLACEMENT_CONSTRAINT", oneSplitDisposition: "COLOCATE_WITH_FROZEN_DEVELOPMENT_SPLIT_SUBJECT_TO_LATER_CONTAMINATION_AND_EXCLUSION_RULES", incompatibleDevelopmentSplitsDisposition: MHS_V2_COLLISION_DISPOSITION, reasonCode: MHS_V2_COLLISION_REASON, propagation: "ANY_COLLISION_MEMBER_QUARANTINES_COMPLETE_DERIVED_NEW_DATA_COMPONENT", internalTestDestinationProhibited: true, historicalMovementProhibited: true });

export interface MhsV2CollisionPolicyPayload {
  readonly schemaVersion: typeof MHS_V2_COLLISION_POLICY_SCHEMA; readonly policyVersion: typeof MHS_V2_COLLISION_VERSION; readonly phase: "T6L-7K-A1R-CQ"; readonly status: "IMMUTABLE_COLLISION_QUARANTINE_AUTHORITY";
  readonly authorities: CollisionAuthorities; readonly rule: CollisionRule;
  readonly collisionAuthority: { readonly collisionCandidateId: typeof MHS_V2_COLLISION_CANDIDATE_ID; readonly conflictingSplits: readonly ["TRAIN", "VALIDATION"]; readonly reviewRows: readonly [11, 107]; readonly relationships: readonly ["NEAR_DUPLICATE", "DUPLICATE"]; readonly historicalCandidateIds: readonly ["src_b22c1d0d2fe258dd347ce08ec644e53b556eb92c8f582ceb2bd5210ce255fcd6", "src_7e8c80fc8c324cc118ad48ed30acd2231568b0fd3c6ce36ec77144492139f23b"]; readonly historicalComponentIds: readonly ["union_f0fa3cf5b02e27ededf6ebd375af81482ba490acc27bdd1d049130cb04e8e201", "union_1b52a4ae6e80d0f168cca6ab0f673ac9df71a2543183817c8f611f4fc77c70de"] };
  readonly preservation: { readonly candidatePreserved: true; readonly humanModerationLabelsPreserved: true; readonly semanticEvidencePreserved: true; readonly noNewHumanData: true; readonly currentRowsMutated: false };
  readonly threshold: { readonly globalThresholdAuthorized: false; readonly value0_85Authorized: false; readonly diagnosticMinimumAuthorized: false };
  readonly nextPhase: "T6L-7K-A1R-C-R"; readonly frozenAt: typeof MHS_V2_COLLISION_FROZEN_AT;
}
export type MhsV2CollisionPolicyArtifact = MhsV2CollisionPolicyPayload & { readonly policyPayloadDigest: string };

export interface MhsV2CollisionAnalysisPayload {
  readonly schemaVersion: typeof MHS_V2_COLLISION_ANALYSIS_SCHEMA; readonly analysisVersion: typeof MHS_V2_COLLISION_VERSION; readonly phase: "T6L-7K-A1R-CQ"; readonly status: "COLLISION_REPRODUCED_AND_QUARANTINE_REQUIRED";
  readonly authorities: CollisionAuthorities; readonly scopeAHumanSemanticPositiveCount: 7; readonly scopeBHumanSemanticPositiveCount: 3;
  readonly collisionGroupCount: 1; readonly conflictingNewV2CandidateCount: 1; readonly constraints: readonly HistoricalAnchorConstraint[];
  readonly collisionCandidate: { readonly candidateId: typeof MHS_V2_COLLISION_CANDIDATE_ID; readonly moderationBindingDigest: string; readonly currentSplit: "UNASSIGNED"; readonly currentTrainingEligible: false };
  readonly findings: { readonly historicalAnchorsMoved: 0; readonly newCandidateAssignedTrain: false; readonly newCandidateAssignedValidation: false; readonly newCandidateAssignedInternalTest: false; readonly trainingEligibilityChanged: false; readonly candidateDeleted: false; readonly humanEvidenceRemoved: false; readonly moderationLabelsChanged: false; readonly semanticEvidenceChanged: false; readonly thresholdSelected: false; readonly newHumanAnnotation: false; readonly finalComponentsConstructed: false };
  readonly frozenAt: typeof MHS_V2_COLLISION_FROZEN_AT;
}
export type MhsV2CollisionAnalysisArtifact = MhsV2CollisionAnalysisPayload & { readonly analysisPayloadDigest: string };

export interface MhsV2CollisionCertificationPayload {
  readonly schemaVersion: typeof MHS_V2_COLLISION_CERTIFICATION_SCHEMA; readonly certificationVersion: typeof MHS_V2_COLLISION_VERSION; readonly phase: "T6L-7K-A1R-CQ"; readonly status: "CERTIFIED";
  readonly authorities: CollisionAuthorities & { readonly policySha256: string; readonly policyPayloadDigest: string; readonly analysisSha256: string; readonly analysisPayloadDigest: string };
  readonly result: { readonly collisionGroupCount: 1; readonly conflictingCandidateId: typeof MHS_V2_COLLISION_CANDIDATE_ID; readonly conflictingSplits: readonly ["TRAIN", "VALIDATION"]; readonly disposition: typeof MHS_V2_COLLISION_DISPOSITION; readonly reasonCode: typeof MHS_V2_COLLISION_REASON; readonly componentPropagationFrozen: true };
  readonly validation: { readonly deterministicReplayMatched: true; readonly immutableAtomicPublication: true; readonly overwriteRefusalVerified: true; readonly historicalAuthoritiesUnchanged: true };
  readonly boundaries: MhsV2CollisionAnalysisPayload["findings"] & { readonly internalTestContentAccessed: false; readonly protectedBenchmarkContentAccessed: false; readonly trainingPerformed: false; readonly productionIntegrationPerformed: false };
}
export type MhsV2CollisionCertificationArtifact = MhsV2CollisionCertificationPayload & { readonly certificationPayloadDigest: string };

const collisionAuthority = (): MhsV2CollisionPolicyPayload["collisionAuthority"] => ({ collisionCandidateId: MHS_V2_COLLISION_CANDIDATE_ID, conflictingSplits: ["TRAIN", "VALIDATION"], reviewRows: [11, 107], relationships: ["NEAR_DUPLICATE", "DUPLICATE"], historicalCandidateIds: ["src_b22c1d0d2fe258dd347ce08ec644e53b556eb92c8f582ceb2bd5210ce255fcd6", "src_7e8c80fc8c324cc118ad48ed30acd2231568b0fd3c6ce36ec77144492139f23b"], historicalComponentIds: ["union_f0fa3cf5b02e27ededf6ebd375af81482ba490acc27bdd1d049130cb04e8e201", "union_1b52a4ae6e80d0f168cca6ab0f673ac9df71a2543183817c8f611f4fc77c70de"] });

export const createMhsV2CollisionPolicy = (inputs: MhsV2CollisionInputs): MhsV2CollisionPolicyArtifact => {
  const verified = verifyInputs(inputs), constraints = deriveHistoricalAnchorConstraints(verified.joined, verified.splitManifest.candidateMembershipIndex), collisions = constraints.filter((constraint) => constraint.collision);
  if (collisions.length !== 1 || collisions[0].v2CandidateId !== MHS_V2_COLLISION_CANDIDATE_ID || canonicalJson(collisions[0].anchors.map((anchor) => [anchor.reviewRowNumber, anchor.relationship, anchor.historicalCandidateId, anchor.historicalComponentId, anchor.frozenSplit])) !== canonicalJson([[11, "NEAR_DUPLICATE", collisionAuthority().historicalCandidateIds[0], collisionAuthority().historicalComponentIds[0], "TRAIN"], [107, "DUPLICATE", collisionAuthority().historicalCandidateIds[1], collisionAuthority().historicalComponentIds[1], "VALIDATION"]])) throw new Error("A1R-CQ exact collision authority was not reproduced");
  const payload: MhsV2CollisionPolicyPayload = { schemaVersion: MHS_V2_COLLISION_POLICY_SCHEMA, policyVersion: MHS_V2_COLLISION_VERSION, phase: "T6L-7K-A1R-CQ", status: "IMMUTABLE_COLLISION_QUARANTINE_AUTHORITY", authorities: authorities(), rule: collisionRule(), collisionAuthority: collisionAuthority(), preservation: { candidatePreserved: true, humanModerationLabelsPreserved: true, semanticEvidencePreserved: true, noNewHumanData: true, currentRowsMutated: false }, threshold: { globalThresholdAuthorized: false, value0_85Authorized: false, diagnosticMinimumAuthorized: false }, nextPhase: "T6L-7K-A1R-C-R", frozenAt: MHS_V2_COLLISION_FROZEN_AT };
  const artifact = { ...payload, policyPayloadDigest: digest(payload) }; validateMhsV2CollisionPolicy(artifact); return artifact;
};

export const createMhsV2CollisionAnalysis = (inputs: MhsV2CollisionInputs): MhsV2CollisionAnalysisArtifact => {
  const verified = verifyInputs(inputs), constraints = deriveHistoricalAnchorConstraints(verified.joined, verified.splitManifest.candidateMembershipIndex);
  const collision = constraints.filter((constraint) => constraint.collision), scopeA = verified.joined.filter((row) => row.scope === "A" && isDuplicateLike(row)), scopeB = verified.joined.filter((row) => row.scope === "B" && isDuplicateLike(row));
  if (collision.length !== 1 || collision[0].v2CandidateId !== MHS_V2_COLLISION_CANDIDATE_ID || scopeA.length !== 7 || scopeB.length !== 3 || constraints.length !== 2) throw new Error("A1R-CQ collision count or semantic-positive authority mismatch");
  const candidate = verified.consolidation.rows.find((row) => row.candidateId === MHS_V2_COLLISION_CANDIDATE_ID); if (!candidate || candidate.split !== "UNASSIGNED" || candidate.trainingEligible) throw new Error("A1R-CQ conflicting V2 candidate state mismatch");
  if (verified.consolidation.leakageCertification.exactDuplicateGroupCount !== 0 || verified.consolidation.leakageCertification.normalizedDuplicateGroupCount !== 0 || verified.consolidation.leakageCertification.sharedLineageGroupCount !== 0 || verified.consolidation.leakageCertification.preliminarySingletonComponentCount !== 400 || verified.consolidation.leakageCertification.semanticGroupingAuthorityPresent || verified.consolidation.summary.trainingEligibleCount !== 0 || verified.consolidation.rows.some((row) => row.split !== "UNASSIGNED" || row.trainingEligible)) throw new Error("A1R-CQ V2 consolidation state changed");
  const moderationBindingDigest = digest({ candidateId: candidate.candidateId, textSha256: candidate.textSha256, decision: candidate.decision, primaryCategory: candidate.primaryCategory, secondaryCategories: candidate.secondaryCategories, reasonCode: candidate.reasonCode, reviewerId: candidate.reviewerId, reviewerRole: candidate.reviewerRole, reviewedAt: candidate.reviewedAt });
  const findings = { historicalAnchorsMoved: 0 as const, newCandidateAssignedTrain: false as const, newCandidateAssignedValidation: false as const, newCandidateAssignedInternalTest: false as const, trainingEligibilityChanged: false as const, candidateDeleted: false as const, humanEvidenceRemoved: false as const, moderationLabelsChanged: false as const, semanticEvidenceChanged: false as const, thresholdSelected: false as const, newHumanAnnotation: false as const, finalComponentsConstructed: false as const };
  const payload: MhsV2CollisionAnalysisPayload = { schemaVersion: MHS_V2_COLLISION_ANALYSIS_SCHEMA, analysisVersion: MHS_V2_COLLISION_VERSION, phase: "T6L-7K-A1R-CQ", status: "COLLISION_REPRODUCED_AND_QUARANTINE_REQUIRED", authorities: authorities(), scopeAHumanSemanticPositiveCount: 7, scopeBHumanSemanticPositiveCount: 3, collisionGroupCount: 1, conflictingNewV2CandidateCount: 1, constraints, collisionCandidate: { candidateId: MHS_V2_COLLISION_CANDIDATE_ID, moderationBindingDigest, currentSplit: "UNASSIGNED", currentTrainingEligible: false }, findings, frozenAt: MHS_V2_COLLISION_FROZEN_AT };
  const artifact = { ...payload, analysisPayloadDigest: digest(payload) }; validateMhsV2CollisionAnalysis(artifact); return artifact;
};

export const createMhsV2CollisionCertification = (policy: MhsV2CollisionPolicyArtifact, analysis: MhsV2CollisionAnalysisArtifact): MhsV2CollisionCertificationArtifact => {
  validateMhsV2CollisionPolicy(policy); validateMhsV2CollisionAnalysis(analysis); const findings = analysis.findings;
  const payload: MhsV2CollisionCertificationPayload = { schemaVersion: MHS_V2_COLLISION_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_COLLISION_VERSION, phase: "T6L-7K-A1R-CQ", status: "CERTIFIED", authorities: { ...authorities(), policySha256: sha256(Buffer.from(canonicalJson(policy), "utf8")), policyPayloadDigest: policy.policyPayloadDigest, analysisSha256: sha256(Buffer.from(canonicalJson(analysis), "utf8")), analysisPayloadDigest: analysis.analysisPayloadDigest }, result: { collisionGroupCount: 1, conflictingCandidateId: MHS_V2_COLLISION_CANDIDATE_ID, conflictingSplits: ["TRAIN", "VALIDATION"], disposition: MHS_V2_COLLISION_DISPOSITION, reasonCode: MHS_V2_COLLISION_REASON, componentPropagationFrozen: true }, validation: { deterministicReplayMatched: true, immutableAtomicPublication: true, overwriteRefusalVerified: true, historicalAuthoritiesUnchanged: true }, boundaries: { ...findings, internalTestContentAccessed: false, protectedBenchmarkContentAccessed: false, trainingPerformed: false, productionIntegrationPerformed: false } };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2CollisionCertification(artifact); return artifact;
};

export const validateMhsV2CollisionPolicy = (artifact: MhsV2CollisionPolicyArtifact): void => { const { policyPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_COLLISION_POLICY_SCHEMA || artifact.policyVersion !== MHS_V2_COLLISION_VERSION || artifact.phase !== "T6L-7K-A1R-CQ" || artifact.status !== "IMMUTABLE_COLLISION_QUARANTINE_AUTHORITY" || canonicalJson(artifact.authorities) !== canonicalJson(authorities()) || canonicalJson(artifact.rule) !== canonicalJson(collisionRule()) || canonicalJson(artifact.collisionAuthority) !== canonicalJson(collisionAuthority()) || !artifact.preservation.candidatePreserved || !artifact.preservation.humanModerationLabelsPreserved || !artifact.preservation.semanticEvidencePreserved || !artifact.preservation.noNewHumanData || artifact.preservation.currentRowsMutated || Object.values(artifact.threshold).some(Boolean) || artifact.nextPhase !== "T6L-7K-A1R-C-R" || artifact.frozenAt !== MHS_V2_COLLISION_FROZEN_AT || policyPayloadDigest !== MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST || policyPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-CQ collision policy");
};

export const validateMhsV2CollisionAnalysis = (artifact: MhsV2CollisionAnalysisArtifact): void => { const { analysisPayloadDigest, ...payload } = artifact; const collision = artifact.constraints.filter((constraint) => constraint.collision);
  if (artifact.schemaVersion !== MHS_V2_COLLISION_ANALYSIS_SCHEMA || artifact.analysisVersion !== MHS_V2_COLLISION_VERSION || artifact.phase !== "T6L-7K-A1R-CQ" || artifact.status !== "COLLISION_REPRODUCED_AND_QUARANTINE_REQUIRED" || canonicalJson(artifact.authorities) !== canonicalJson(authorities()) || artifact.scopeAHumanSemanticPositiveCount !== 7 || artifact.scopeBHumanSemanticPositiveCount !== 3 || artifact.collisionGroupCount !== 1 || artifact.conflictingNewV2CandidateCount !== 1 || collision.length !== 1 || collision[0].v2CandidateId !== MHS_V2_COLLISION_CANDIDATE_ID || canonicalJson(collision[0].frozenSplits) !== canonicalJson(["TRAIN", "VALIDATION"]) || artifact.collisionCandidate.currentSplit !== "UNASSIGNED" || artifact.collisionCandidate.currentTrainingEligible || !/^[a-f0-9]{64}$/u.test(artifact.collisionCandidate.moderationBindingDigest) || Object.values(artifact.findings).some(Boolean) || artifact.frozenAt !== MHS_V2_COLLISION_FROZEN_AT || analysisPayloadDigest !== MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST || analysisPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-CQ collision analysis");
};

export const validateMhsV2CollisionCertification = (artifact: MhsV2CollisionCertificationArtifact): void => { const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_COLLISION_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_COLLISION_VERSION || artifact.phase !== "T6L-7K-A1R-CQ" || artifact.status !== "CERTIFIED" || canonicalJson(Object.fromEntries(Object.entries(artifact.authorities).filter(([key]) => !key.startsWith("policy") && !key.startsWith("analysis")))) !== canonicalJson(authorities()) || artifact.authorities.policySha256 !== MHS_V2_COLLISION_POLICY_SHA256 || artifact.authorities.policyPayloadDigest !== MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST || artifact.authorities.analysisSha256 !== MHS_V2_COLLISION_ANALYSIS_SHA256 || artifact.authorities.analysisPayloadDigest !== MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST || artifact.result.collisionGroupCount !== 1 || artifact.result.conflictingCandidateId !== MHS_V2_COLLISION_CANDIDATE_ID || canonicalJson(artifact.result.conflictingSplits) !== canonicalJson(["TRAIN", "VALIDATION"]) || artifact.result.disposition !== MHS_V2_COLLISION_DISPOSITION || artifact.result.reasonCode !== MHS_V2_COLLISION_REASON || !artifact.result.componentPropagationFrozen || Object.values(artifact.validation).some((value) => value !== true) || Object.values(artifact.boundaries).some(Boolean) || certificationPayloadDigest !== MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST || certificationPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-CQ collision certification");
};

type TriplePublisher = (policyTemporary: string, policyTarget: string, analysisTemporary: string, analysisTarget: string, certificationTemporary: string, certificationTarget: string) => void;
const defaultPublisher: TriplePublisher = (policyTemporary, policyTarget, analysisTemporary, analysisTarget, certificationTemporary, certificationTarget) => { fs.renameSync(policyTemporary, policyTarget); fs.renameSync(analysisTemporary, analysisTarget); fs.renameSync(certificationTemporary, certificationTarget); };
export const publishMhsV2CollisionAuthority = (policy: MhsV2CollisionPolicyArtifact, analysis: MhsV2CollisionAnalysisArtifact, certification: MhsV2CollisionCertificationArtifact, outputDirectory: string, publish: TriplePublisher = defaultPublisher): { readonly policyPath: string; readonly analysisPath: string; readonly certificationPath: string; readonly policySha256: string; readonly analysisSha256: string; readonly certificationSha256: string } => {
  validateMhsV2CollisionPolicy(policy); validateMhsV2CollisionAnalysis(analysis); validateMhsV2CollisionCertification(certification);
  const texts = [canonicalJson(policy), canonicalJson(analysis), canonicalJson(certification)] as const, targets = [path.join(outputDirectory, MHS_V2_COLLISION_POLICY_FILENAME), path.join(outputDirectory, MHS_V2_COLLISION_ANALYSIS_FILENAME), path.join(outputDirectory, MHS_V2_COLLISION_CERTIFICATION_FILENAME)] as const;
  if (targets.some((target) => fs.existsSync(target))) throw new Error("A1R-CQ collision authority exists; overwrite refused");
  if (certification.authorities.policySha256 !== sha256(Buffer.from(texts[0], "utf8")) || certification.authorities.analysisSha256 !== sha256(Buffer.from(texts[1], "utf8"))) throw new Error("A1R-CQ certification binding mismatch");
  fs.mkdirSync(outputDirectory, { recursive: true }); const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`; const temporary = targets.map((target) => `${target}.${token}.partial`) as [string, string, string];
  try { temporary.forEach((filename, index) => fs.writeFileSync(filename, texts[index], { flag: "wx" })); publish(temporary[0], targets[0], temporary[1], targets[1], temporary[2], targets[2]); if (targets.some((target, index) => !fs.existsSync(target) || fs.readFileSync(target, "utf8") !== texts[index])) throw new Error("Incomplete A1R-CQ publication"); return { policyPath: targets[0], analysisPath: targets[1], certificationPath: targets[2], policySha256: sha256(Buffer.from(texts[0], "utf8")), analysisSha256: sha256(Buffer.from(texts[1], "utf8")), certificationSha256: sha256(Buffer.from(texts[2], "utf8")) }; }
  catch (error) { targets.forEach((target, index) => { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === texts[index]) fs.rmSync(target, { force: true }); }); throw error; }
  finally { temporary.forEach((filename) => fs.rmSync(filename, { force: true })); }
};
