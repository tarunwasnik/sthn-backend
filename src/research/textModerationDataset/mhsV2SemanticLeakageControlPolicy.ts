import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { MHS_UNION_EDGE_OWNERSHIP } from "./mhsGroupingUnionSplitPlan";
import {
  MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST,
  MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SHA256,
  MhsV2ExpansionAcquisitionArtifact, MhsV2ExpansionCandidateArtifact, validateMhsV2ExpansionArtifacts,
} from "./mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST,
  MHS_V2_EXPANSION_CONSOLIDATION_SHA256, MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST,
} from "./mhsV2ExpansionConsolidation";
import {
  MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST, MHS_V2_COLLISION_ANALYSIS_SHA256,
  MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_COLLISION_CERTIFICATION_SHA256,
  MHS_V2_COLLISION_DISPOSITION, MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST, MHS_V2_COLLISION_POLICY_SHA256,
  MHS_V2_COLLISION_REASON, MhsV2CollisionAnalysisArtifact, MhsV2CollisionCertificationArtifact,
  MhsV2CollisionInputs, MhsV2CollisionPolicyArtifact, createMhsV2CollisionAnalysis,
  createMhsV2CollisionCertification, createMhsV2CollisionPolicy, validateMhsV2CollisionAnalysis,
  validateMhsV2CollisionCertification, validateMhsV2CollisionPolicy,
} from "./mhsV2HistoricalSplitAnchorCollision";
import {
  MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST, MHS_V2_REVIEW_BATCH_PLAN_SHA256,
  MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST, MHS_V2_REVIEW_UNIVERSE_SHA256,
  MhsV2ReviewBatchPlanArtifact, MhsV2ReviewUniverseArtifact,
  validateMhsV2ReviewBatchPlan, validateMhsV2ReviewUniverse,
} from "./mhsV2ExpansionReviewerA";
import {
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256,
} from "./mhsV2SemanticCalibrationEvaluation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256,
} from "./mhsV2SemanticCalibrationExecution";
import {
  E5_CONTRACT_SHA256, E5_EXPORT_MANIFEST_SHA256, E5_RUNTIME_CERTIFICATION_SHA256,
  MHS_INTERNAL_TEST_FREEZE_SHA256, MHS_SPLIT_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
} from "./mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST,
} from "./mhsV2SemanticCalibrationReviewValidation";

export const MHS_V2_LEAKAGE_POLICY_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_CONTROL_POLICY_V1" as const;
export const MHS_V2_LEAKAGE_ANALYSIS_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_CONTROL_ANALYSIS_V1" as const;
export const MHS_V2_LEAKAGE_CERTIFICATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_LEAKAGE_CONTROL_CERTIFICATION_V1" as const;
export const MHS_V2_LEAKAGE_VERSION = "MHS_V2_SEMANTIC_LEAKAGE_CONTROL_V1" as const;
export const MHS_V2_LEAKAGE_POLICY_FILENAME = "mhs-v2-semantic-leakage-control-policy-v1.json" as const;
export const MHS_V2_LEAKAGE_ANALYSIS_FILENAME = "mhs-v2-semantic-leakage-control-analysis-v1.json" as const;
export const MHS_V2_LEAKAGE_CERTIFICATION_FILENAME = "mhs-v2-semantic-leakage-control-certification-v1.json" as const;
export const MHS_V2_LEAKAGE_POLICY_SHA256 = "e7723e8576d3f1f2786b2328b71a5a34930ddbcaf250507fdc227240175399a3" as const;
export const MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST = "ee082caba73b073d7ef4daa2160f729b05864f5034bfb00bb0ca4257ef79e5be" as const;
export const MHS_V2_LEAKAGE_ANALYSIS_SHA256 = "6153d6aa269e6040e51e7151937e5fc552533e96de92e613e353d3504f90a0ca" as const;
export const MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST = "524cc27395af8b72638de78ec809e98b7e61055bb817e6d54e571a0f6502aad8" as const;
export const MHS_V2_LEAKAGE_CERTIFICATION_SHA256 = "a5208464553712b1de3d423a1f382a53a834ccbab1f3d66bc0605f1bb985f2a5" as const;
export const MHS_V2_LEAKAGE_CERTIFICATION_PAYLOAD_DIGEST = "2b7a4d3c657b02b568fdc6938e4785fb95415a9f6d7a6070bc17795b21a9a21a" as const;
export const MHS_V2_LEAKAGE_STRATEGY = "HYBRID_DETERMINISTIC_AND_HUMAN_CONFIRMED_LEAKAGE_CONTROL" as const;
export const MHS_V2_LEAKAGE_FROZEN_AT = "2026-09-20T15:00:00.000Z" as const;

export const MHS_V2_ALLOWED_EDGE_AUTHORITIES = ["EXACT_DUPLICATE", "NORMALIZED_DUPLICATE", "LINEAGE", "HUMAN_DUPLICATE", "HUMAN_NEAR_DUPLICATE"] as const;
export type MhsV2AllowedEdgeAuthority = typeof MHS_V2_ALLOWED_EDGE_AUTHORITIES[number];
export const MHS_V2_PROHIBITED_EDGE_AUTHORITIES = ["RELATED_BUT_DISTINCT", "UNRELATED", "E5_SCORE_ONLY", "MACHINE_SAME_SPLIT_SCORE_ONLY", "SOURCE_NATIVE_NEAR_PAIR_WITHOUT_FROZEN_AUTHORITY", "TEMPLATE_FAMILY_WITHOUT_FROZEN_AUTHORITY"] as const;
export type MhsV2ProhibitedEdgeAuthority = typeof MHS_V2_PROHIBITED_EDGE_AUTHORITIES[number];
export const mhsV2MayCreateWithinV2Edge = (authority: MhsV2AllowedEdgeAuthority | MhsV2ProhibitedEdgeAuthority): boolean => (MHS_V2_ALLOWED_EDGE_AUTHORITIES as readonly string[]).includes(authority);

export type MhsV2HistoricalAnchorDisposition = "NO_HISTORICAL_SPLIT_ANCHOR" | "SINGLE_FROZEN_HISTORICAL_TRAIN_ANCHOR" | "SINGLE_FROZEN_HISTORICAL_VALIDATION_ANCHOR" | typeof MHS_V2_COLLISION_REASON;
export const resolveMhsV2HistoricalAnchorDisposition = (splits: readonly ("TRAIN" | "VALIDATION" | "INTERNAL_TEST")[]): MhsV2HistoricalAnchorDisposition => {
  const unique = [...new Set(splits)].sort();
  if (unique.includes("INTERNAL_TEST")) throw new Error("A1R-C-R unauthorized INTERNAL_TEST historical anchor; fail closed");
  if (unique.length === 0) return "NO_HISTORICAL_SPLIT_ANCHOR";
  if (unique.length === 1) return unique[0] === "TRAIN" ? "SINGLE_FROZEN_HISTORICAL_TRAIN_ANCHOR" : "SINGLE_FROZEN_HISTORICAL_VALIDATION_ANCHOR";
  return MHS_V2_COLLISION_REASON;
};
export const resolveMhsV2PlacementPrecedence = (anchorDisposition: MhsV2HistoricalAnchorDisposition, protectedContaminationExclusion: boolean): "EXCLUDED_BY_PROTECTED_CONTAMINATION" | typeof MHS_V2_COLLISION_DISPOSITION | "CONSTRAIN_TO_TRAIN" | "CONSTRAIN_TO_VALIDATION" | "UNCONSTRAINED_PENDING_LATER_PHASE" => {
  if (protectedContaminationExclusion) return "EXCLUDED_BY_PROTECTED_CONTAMINATION";
  if (anchorDisposition === MHS_V2_COLLISION_REASON) return MHS_V2_COLLISION_DISPOSITION;
  if (anchorDisposition === "SINGLE_FROZEN_HISTORICAL_TRAIN_ANCHOR") return "CONSTRAIN_TO_TRAIN";
  if (anchorDisposition === "SINGLE_FROZEN_HISTORICAL_VALIDATION_ANCHOR") return "CONSTRAIN_TO_VALIDATION";
  return "UNCONSTRAINED_PENDING_LATER_PHASE";
};

interface LeakageAuthorities {
  readonly v2CandidateSha256: typeof MHS_V2_EXPANSION_CANDIDATE_SHA256; readonly v2CandidatePayloadDigest: typeof MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST; readonly v2CandidateMembershipDigest: typeof MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST; readonly v2AcquisitionSha256: typeof MHS_V2_EXPANSION_ACQUISITION_SHA256;
  readonly reviewUniverseSha256: typeof MHS_V2_REVIEW_UNIVERSE_SHA256; readonly reviewUniversePayloadDigest: typeof MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST; readonly operationalPlanSha256: typeof MHS_V2_REVIEW_BATCH_PLAN_SHA256; readonly operationalPlanPayloadDigest: typeof MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST;
  readonly consolidationSha256: typeof MHS_V2_EXPANSION_CONSOLIDATION_SHA256; readonly consolidationPayloadDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST; readonly consolidationMembershipDigest: typeof MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST; readonly consolidationReviewerDigest: typeof MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST;
  readonly historicalSplitManifestSha256: typeof MHS_SPLIT_SHA256; readonly internalTestFreezeMetadataSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256;
  readonly calibrationPolicySha256: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256; readonly calibrationPolicyPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST; readonly calibrationMembershipSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256; readonly calibrationMembershipPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST; readonly calibrationMembershipDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST;
  readonly completedReviewSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256; readonly canonicalReviewPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST; readonly reviewCertificationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256; readonly reviewCertificationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly evaluationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256; readonly evaluationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST; readonly evaluationCertificationSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256; readonly evaluationCertificationPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly collisionPolicySha256: typeof MHS_V2_COLLISION_POLICY_SHA256; readonly collisionPolicyPayloadDigest: typeof MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST; readonly collisionAnalysisSha256: typeof MHS_V2_COLLISION_ANALYSIS_SHA256; readonly collisionAnalysisPayloadDigest: typeof MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST; readonly collisionCertificationSha256: typeof MHS_V2_COLLISION_CERTIFICATION_SHA256; readonly collisionCertificationPayloadDigest: typeof MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST;
  readonly e5ContractSha256: typeof E5_CONTRACT_SHA256; readonly e5ExportManifestSha256: typeof E5_EXPORT_MANIFEST_SHA256; readonly e5RuntimeCertificationSha256: typeof E5_RUNTIME_CERTIFICATION_SHA256;
}
const authorities = (): LeakageAuthorities => ({ v2CandidateSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, v2CandidatePayloadDigest: MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, v2CandidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, v2AcquisitionSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256, reviewUniverseSha256: MHS_V2_REVIEW_UNIVERSE_SHA256, reviewUniversePayloadDigest: MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST, operationalPlanSha256: MHS_V2_REVIEW_BATCH_PLAN_SHA256, operationalPlanPayloadDigest: MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST, consolidationSha256: MHS_V2_EXPANSION_CONSOLIDATION_SHA256, consolidationPayloadDigest: MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST, consolidationMembershipDigest: MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST, consolidationReviewerDigest: MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST, historicalSplitManifestSha256: MHS_SPLIT_SHA256, internalTestFreezeMetadataSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, calibrationPolicySha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, calibrationPolicyPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST, calibrationMembershipSha256: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256, calibrationMembershipPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST, calibrationMembershipDigest: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST, completedReviewSha256: MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_SHA256, canonicalReviewPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PAYLOAD_DIGEST, reviewCertificationSha256: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_SHA256, reviewCertificationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_PAYLOAD_DIGEST, evaluationSha256: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_SHA256, evaluationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_PAYLOAD_DIGEST, evaluationCertificationSha256: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_SHA256, evaluationCertificationPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_PAYLOAD_DIGEST, collisionPolicySha256: MHS_V2_COLLISION_POLICY_SHA256, collisionPolicyPayloadDigest: MHS_V2_COLLISION_POLICY_PAYLOAD_DIGEST, collisionAnalysisSha256: MHS_V2_COLLISION_ANALYSIS_SHA256, collisionAnalysisPayloadDigest: MHS_V2_COLLISION_ANALYSIS_PAYLOAD_DIGEST, collisionCertificationSha256: MHS_V2_COLLISION_CERTIFICATION_SHA256, collisionCertificationPayloadDigest: MHS_V2_COLLISION_CERTIFICATION_PAYLOAD_DIGEST, e5ContractSha256: E5_CONTRACT_SHA256, e5ExportManifestSha256: E5_EXPORT_MANIFEST_SHA256, e5RuntimeCertificationSha256: E5_RUNTIME_CERTIFICATION_SHA256 });

export interface MhsV2LeakageControlInputs {
  readonly collisionInputs: MhsV2CollisionInputs; readonly collisionPolicyBytes: Buffer; readonly collisionAnalysisBytes: Buffer; readonly collisionCertificationBytes: Buffer;
  readonly candidateBytes: Buffer; readonly acquisitionBytes: Buffer; readonly universeBytes: Buffer; readonly operationalPlanBytes: Buffer;
}
interface VerifiedInputs { readonly collisionPolicy: MhsV2CollisionPolicyArtifact; readonly collisionAnalysis: MhsV2CollisionAnalysisArtifact; readonly collisionCertification: MhsV2CollisionCertificationArtifact; readonly candidate: MhsV2ExpansionCandidateArtifact; readonly universe: MhsV2ReviewUniverseArtifact }
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const verifyInputs = (inputs: MhsV2LeakageControlInputs): VerifiedInputs => {
  const expectedPolicy = createMhsV2CollisionPolicy(inputs.collisionInputs), expectedAnalysis = createMhsV2CollisionAnalysis(inputs.collisionInputs), expectedCertification = createMhsV2CollisionCertification(expectedPolicy, expectedAnalysis);
  if (sha256(inputs.collisionPolicyBytes) !== MHS_V2_COLLISION_POLICY_SHA256 || sha256(inputs.collisionAnalysisBytes) !== MHS_V2_COLLISION_ANALYSIS_SHA256 || sha256(inputs.collisionCertificationBytes) !== MHS_V2_COLLISION_CERTIFICATION_SHA256) throw new Error("A1R-C-R collision authority SHA mismatch");
  const collisionPolicy = parse<MhsV2CollisionPolicyArtifact>(inputs.collisionPolicyBytes), collisionAnalysis = parse<MhsV2CollisionAnalysisArtifact>(inputs.collisionAnalysisBytes), collisionCertification = parse<MhsV2CollisionCertificationArtifact>(inputs.collisionCertificationBytes); validateMhsV2CollisionPolicy(collisionPolicy); validateMhsV2CollisionAnalysis(collisionAnalysis); validateMhsV2CollisionCertification(collisionCertification);
  if (canonicalJson(collisionPolicy) !== canonicalJson(expectedPolicy) || canonicalJson(collisionAnalysis) !== canonicalJson(expectedAnalysis) || canonicalJson(collisionCertification) !== canonicalJson(expectedCertification)) throw new Error("A1R-C-R collision authority replay mismatch");
  if (sha256(inputs.candidateBytes) !== MHS_V2_EXPANSION_CANDIDATE_SHA256 || sha256(inputs.acquisitionBytes) !== MHS_V2_EXPANSION_ACQUISITION_SHA256) throw new Error("A1R-C-R candidate authority SHA mismatch");
  const candidate = parse<MhsV2ExpansionCandidateArtifact>(inputs.candidateBytes), acquisition = parse<MhsV2ExpansionAcquisitionArtifact>(inputs.acquisitionBytes); validateMhsV2ExpansionArtifacts(candidate, acquisition);
  if (sha256(inputs.universeBytes) !== MHS_V2_REVIEW_UNIVERSE_SHA256 || sha256(inputs.operationalPlanBytes) !== MHS_V2_REVIEW_BATCH_PLAN_SHA256) throw new Error("A1R-C-R review authority SHA mismatch");
  const universe = parse<MhsV2ReviewUniverseArtifact>(inputs.universeBytes), operationalPlan = parse<MhsV2ReviewBatchPlanArtifact>(inputs.operationalPlanBytes); validateMhsV2ReviewUniverse(universe); validateMhsV2ReviewBatchPlan(operationalPlan, universe);
  if (candidate.rows.length !== 400 || universe.candidateCount !== 400 || collisionAnalysis.collisionGroupCount !== 1 || collisionAnalysis.scopeAHumanSemanticPositiveCount !== 7 || collisionAnalysis.scopeBHumanSemanticPositiveCount !== 3) throw new Error("A1R-C-R frozen authority counts mismatch");
  return { collisionPolicy, collisionAnalysis, collisionCertification, candidate, universe };
};

interface LeakageBoundaries { readonly graphConstructed: false; readonly componentsConstructed: false; readonly splitsAssigned: false; readonly trainingEligibilityChanged: false; readonly successorNumericThresholdSelected: false; readonly machineOnlySemanticAuthorityCreated: false; readonly newHumanAnnotationRequested: false; readonly protectedBenchmarkContentAccessed: false; readonly internalTestContentAccessed: false; readonly protectedContaminationExecuted: false; readonly trainingPerformed: false; readonly productionIntegrationPerformed: false }
const boundaries = (): LeakageBoundaries => ({ graphConstructed: false, componentsConstructed: false, splitsAssigned: false, trainingEligibilityChanged: false, successorNumericThresholdSelected: false, machineOnlySemanticAuthorityCreated: false, newHumanAnnotationRequested: false, protectedBenchmarkContentAccessed: false, internalTestContentAccessed: false, protectedContaminationExecuted: false, trainingPerformed: false, productionIntegrationPerformed: false });

export interface MhsV2LeakageControlPolicyPayload {
  readonly schemaVersion: typeof MHS_V2_LEAKAGE_POLICY_SCHEMA; readonly policyVersion: typeof MHS_V2_LEAKAGE_VERSION; readonly phase: "T6L-7K-A1R-C-R"; readonly status: "IMMUTABLE_SUCCESSOR_LEAKAGE_CONTROL_POLICY"; readonly authorities: LeakageAuthorities;
  readonly selectedStrategy: typeof MHS_V2_LEAKAGE_STRATEGY;
  readonly allowedWithinV2EdgeAuthorities: readonly { readonly authority: MhsV2AllowedEdgeAuthority; readonly repositoryEdgeType: "EXACT_DUPLICATE" | "NORMALIZED_DUPLICATE" | "LINEAGE" | "SEMANTIC_REVIEWED"; readonly splitBinding: true; readonly impliesPairwiseSemanticEquivalence: boolean; readonly currentAuthorityCount: number }[];
  readonly prohibitedEdgeAuthorities: typeof MHS_V2_PROHIBITED_EDGE_AUTHORITIES;
  readonly humanEvidence: { readonly duplicateLikeTotal: 10; readonly scopeAWithinV2Edges: 7; readonly scopeBHistoricalAnchors: 3; readonly duplicateTotal: 4; readonly nearDuplicateTotal: 6; readonly unresolved: 0 };
  readonly threshold: { readonly historical0_85: "NOT_AUTHORIZED_FOR_MHS_V2"; readonly successorNumericThreshold: null; readonly selectedStrategyThresholdStatus: "NOT_REQUIRED_FOR_SELECTED_STRATEGY"; readonly diagnosticScoresRemainNonAuthoritative: readonly [0.849778934932, 0.839905153686] };
  readonly e5: { readonly operationalStatus: "DIAGNOSTIC_ONLY"; readonly mayCreateEdge: false; readonly mayCreateSameSplitConstraint: false };
  readonly historicalAnchors: { readonly scopeBRepresentation: "PLACEMENT_CONSTRAINT_NOT_MUTABLE_CROSS_DATASET_COMPONENT_MERGE"; readonly noAnchor: "NO_HISTORICAL_SPLIT_ANCHOR"; readonly singleAnchor: "COLOCATE_NEW_COMPONENT_WITH_FROZEN_DEVELOPMENT_SPLIT_SUBJECT_TO_STRONGER_EXCLUSIONS"; readonly conflictingAnchors: typeof MHS_V2_COLLISION_DISPOSITION; readonly internalTestAnchor: "FAIL_CLOSED"; readonly historicalCandidatesMove: false; readonly knownSingleTrainAnchorCount: 1; readonly knownCollisionCount: 1 };
  readonly precedence: { readonly componentAtomicity: "COMPLETE_DERIVED_V2_COMPONENT_IS_ONE_SPLIT_PLACEMENT_UNIT"; readonly collisionQuarantineOverridesOrdinaryAnchor: true; readonly futureProtectedContaminationExclusionOverridesPlacementAnchor: true; readonly componentSplittingToSatisfyConflictsAllowed: false };
  readonly labelPolicy: { readonly moderationLabelsPropagateAcrossEdges: false; readonly preservedFields: readonly ["decision", "primaryCategory", "secondaryCategories", "reasonCode"]; readonly mixedLabelsInsideComponentAllowed: true };
  readonly semanticClaimSafety: { readonly transitiveConnectivityPurpose: "SPLIT_ATOMICITY_ONLY"; readonly transitiveConnectivityProvesPairwiseSemanticEquivalence: false; readonly evidenceProvenancePreserved: true };
  readonly currentPipelineHumanDataRule: "NO_ADDITIONAL_HUMAN_SEMANTIC_ANNOTATION_REQUIRED_FOR_CURRENT_FROZEN_MHS_V2_PIPELINE";
  readonly nextPhase: "T6L-7K-B"; readonly boundaries: LeakageBoundaries; readonly frozenAt: typeof MHS_V2_LEAKAGE_FROZEN_AT;
}
export type MhsV2LeakageControlPolicyArtifact = MhsV2LeakageControlPolicyPayload & { readonly policyPayloadDigest: string };

const allowedAuthorities = (): MhsV2LeakageControlPolicyPayload["allowedWithinV2EdgeAuthorities"] => [
  { authority: "EXACT_DUPLICATE", repositoryEdgeType: "EXACT_DUPLICATE", splitBinding: true, impliesPairwiseSemanticEquivalence: true, currentAuthorityCount: 0 },
  { authority: "NORMALIZED_DUPLICATE", repositoryEdgeType: "NORMALIZED_DUPLICATE", splitBinding: true, impliesPairwiseSemanticEquivalence: true, currentAuthorityCount: 0 },
  { authority: "LINEAGE", repositoryEdgeType: "LINEAGE", splitBinding: true, impliesPairwiseSemanticEquivalence: false, currentAuthorityCount: 0 },
  { authority: "HUMAN_DUPLICATE", repositoryEdgeType: "SEMANTIC_REVIEWED", splitBinding: true, impliesPairwiseSemanticEquivalence: false, currentAuthorityCount: 3 },
  { authority: "HUMAN_NEAR_DUPLICATE", repositoryEdgeType: "SEMANTIC_REVIEWED", splitBinding: true, impliesPairwiseSemanticEquivalence: false, currentAuthorityCount: 4 },
];

export interface MhsV2LeakageControlAnalysisPayload {
  readonly schemaVersion: typeof MHS_V2_LEAKAGE_ANALYSIS_SCHEMA; readonly analysisVersion: typeof MHS_V2_LEAKAGE_VERSION; readonly phase: "T6L-7K-A1R-C-R"; readonly status: "SUCCESSOR_STRATEGY_SELECTED"; readonly authorities: LeakageAuthorities;
  readonly strategies: readonly [
    { readonly strategy: "A_SUCCESSOR_GLOBAL_THRESHOLD"; readonly result: "NOT_AUTHORIZED_BY_EXISTING_EVIDENCE" },
    { readonly strategy: "B_HUMAN_CONFIRMED_EDGES_ONLY"; readonly result: "EVIDENCE_CORRECT" },
    { readonly strategy: "C_DETERMINISTIC_PLUS_HUMAN_EDGES"; readonly result: "PREFERRED_AND_SELECTED" },
    { readonly strategy: "D_MACHINE_SAME_SPLIT_CONSTRAINTS"; readonly result: "NOT_AUTHORIZED" },
    { readonly strategy: "E_NO_ADDITIONAL_SEMANTIC_AUTHORITY"; readonly result: "INSUFFICIENT_KNOWN_HUMAN_LEAKAGE_EVIDENCE_EXISTS" }
  ];
  readonly findings: { readonly selectedStrategy: typeof MHS_V2_LEAKAGE_STRATEGY; readonly collisionAuthorityRequired: true; readonly collisionAuthorityValid: true; readonly knownCollisionCount: 1; readonly collisionDispositionedCount: 1; readonly nonConflictingTrainAnchorCount: 1; readonly exactDuplicateGroupCount: 0; readonly normalizedDuplicateGroupCount: 0; readonly sharedLineageGroupCount: 0; readonly scopeAEdgeAuthorityCount: 7; readonly scopeBAnchorAuthorityCount: 3; readonly machineSemanticAuthorityCount: 0; readonly graphEdgeCountCreatedInPhase: 0; readonly componentCountCreatedInPhase: 0 };
  readonly boundaries: LeakageBoundaries; readonly frozenAt: typeof MHS_V2_LEAKAGE_FROZEN_AT;
}
export type MhsV2LeakageControlAnalysisArtifact = MhsV2LeakageControlAnalysisPayload & { readonly analysisPayloadDigest: string };

export interface MhsV2LeakageControlCertificationPayload {
  readonly schemaVersion: typeof MHS_V2_LEAKAGE_CERTIFICATION_SCHEMA; readonly certificationVersion: typeof MHS_V2_LEAKAGE_VERSION; readonly phase: "T6L-7K-A1R-C-R"; readonly status: "CERTIFIED";
  readonly authorities: LeakageAuthorities & { readonly successorPolicySha256: string; readonly successorPolicyPayloadDigest: string; readonly consequenceAnalysisSha256: string; readonly consequenceAnalysisPayloadDigest: string };
  readonly result: { readonly selectedStrategy: typeof MHS_V2_LEAKAGE_STRATEGY; readonly allowedEdgeAuthorities: typeof MHS_V2_ALLOWED_EDGE_AUTHORITIES; readonly prohibitedEdgeAuthorities: typeof MHS_V2_PROHIBITED_EDGE_AUTHORITIES; readonly humanDuplicateLikeTotal: 10; readonly scopeAPositiveCount: 7; readonly scopeBPositiveCount: 3; readonly thresholdStatus: "NOT_REQUIRED_FOR_SELECTED_STRATEGY"; readonly noAdditionalHumanAnnotationRequiredForCurrentPipeline: true; readonly nextPhaseAuthorized: "T6L-7K-B" };
  readonly validation: { readonly deterministicReplayMatched: true; readonly immutableAtomicPublication: true; readonly overwriteRefusalVerified: true; readonly upstreamAuthoritiesUnchanged: true };
  readonly boundaries: LeakageBoundaries;
}
export type MhsV2LeakageControlCertificationArtifact = MhsV2LeakageControlCertificationPayload & { readonly certificationPayloadDigest: string };

export const createMhsV2LeakageControlPolicy = (inputs: MhsV2LeakageControlInputs): MhsV2LeakageControlPolicyArtifact => {
  verifyInputs(inputs);
  if (!MHS_UNION_EDGE_OWNERSHIP.EXACT_DUPLICATE.splitBinding || !MHS_UNION_EDGE_OWNERSHIP.NORMALIZED_DUPLICATE.splitBinding || !MHS_UNION_EDGE_OWNERSHIP.LINEAGE.splitBinding || !MHS_UNION_EDGE_OWNERSHIP.SEMANTIC_REVIEWED.splitBinding || MHS_UNION_EDGE_OWNERSHIP.LINEAGE.impliesSemanticEquivalence || MHS_UNION_EDGE_OWNERSHIP.SEMANTIC_REVIEWED.impliesSemanticEquivalence) throw new Error("A1R-C-R repository edge ownership contradicts successor strategy");
  const payload: MhsV2LeakageControlPolicyPayload = { schemaVersion: MHS_V2_LEAKAGE_POLICY_SCHEMA, policyVersion: MHS_V2_LEAKAGE_VERSION, phase: "T6L-7K-A1R-C-R", status: "IMMUTABLE_SUCCESSOR_LEAKAGE_CONTROL_POLICY", authorities: authorities(), selectedStrategy: MHS_V2_LEAKAGE_STRATEGY, allowedWithinV2EdgeAuthorities: allowedAuthorities(), prohibitedEdgeAuthorities: MHS_V2_PROHIBITED_EDGE_AUTHORITIES, humanEvidence: { duplicateLikeTotal: 10, scopeAWithinV2Edges: 7, scopeBHistoricalAnchors: 3, duplicateTotal: 4, nearDuplicateTotal: 6, unresolved: 0 }, threshold: { historical0_85: "NOT_AUTHORIZED_FOR_MHS_V2", successorNumericThreshold: null, selectedStrategyThresholdStatus: "NOT_REQUIRED_FOR_SELECTED_STRATEGY", diagnosticScoresRemainNonAuthoritative: [0.849778934932, 0.839905153686] }, e5: { operationalStatus: "DIAGNOSTIC_ONLY", mayCreateEdge: false, mayCreateSameSplitConstraint: false }, historicalAnchors: { scopeBRepresentation: "PLACEMENT_CONSTRAINT_NOT_MUTABLE_CROSS_DATASET_COMPONENT_MERGE", noAnchor: "NO_HISTORICAL_SPLIT_ANCHOR", singleAnchor: "COLOCATE_NEW_COMPONENT_WITH_FROZEN_DEVELOPMENT_SPLIT_SUBJECT_TO_STRONGER_EXCLUSIONS", conflictingAnchors: MHS_V2_COLLISION_DISPOSITION, internalTestAnchor: "FAIL_CLOSED", historicalCandidatesMove: false, knownSingleTrainAnchorCount: 1, knownCollisionCount: 1 }, precedence: { componentAtomicity: "COMPLETE_DERIVED_V2_COMPONENT_IS_ONE_SPLIT_PLACEMENT_UNIT", collisionQuarantineOverridesOrdinaryAnchor: true, futureProtectedContaminationExclusionOverridesPlacementAnchor: true, componentSplittingToSatisfyConflictsAllowed: false }, labelPolicy: { moderationLabelsPropagateAcrossEdges: false, preservedFields: ["decision", "primaryCategory", "secondaryCategories", "reasonCode"], mixedLabelsInsideComponentAllowed: true }, semanticClaimSafety: { transitiveConnectivityPurpose: "SPLIT_ATOMICITY_ONLY", transitiveConnectivityProvesPairwiseSemanticEquivalence: false, evidenceProvenancePreserved: true }, currentPipelineHumanDataRule: "NO_ADDITIONAL_HUMAN_SEMANTIC_ANNOTATION_REQUIRED_FOR_CURRENT_FROZEN_MHS_V2_PIPELINE", nextPhase: "T6L-7K-B", boundaries: boundaries(), frozenAt: MHS_V2_LEAKAGE_FROZEN_AT };
  const artifact = { ...payload, policyPayloadDigest: digest(payload) }; validateMhsV2LeakageControlPolicy(artifact); return artifact;
};

export const createMhsV2LeakageControlAnalysis = (inputs: MhsV2LeakageControlInputs): MhsV2LeakageControlAnalysisArtifact => {
  const verified = verifyInputs(inputs); const collision = verified.collisionAnalysis.constraints.filter((constraint) => constraint.collision), singleTrain = verified.collisionAnalysis.constraints.filter((constraint) => !constraint.collision && canonicalJson(constraint.frozenSplits) === canonicalJson(["TRAIN"]));
  if (collision.length !== 1 || singleTrain.length !== 1 || verified.collisionCertification.result.disposition !== MHS_V2_COLLISION_DISPOSITION) throw new Error("A1R-C-R collision disposition is not sufficient to resume");
  const payload: MhsV2LeakageControlAnalysisPayload = { schemaVersion: MHS_V2_LEAKAGE_ANALYSIS_SCHEMA, analysisVersion: MHS_V2_LEAKAGE_VERSION, phase: "T6L-7K-A1R-C-R", status: "SUCCESSOR_STRATEGY_SELECTED", authorities: authorities(), strategies: [{ strategy: "A_SUCCESSOR_GLOBAL_THRESHOLD", result: "NOT_AUTHORIZED_BY_EXISTING_EVIDENCE" }, { strategy: "B_HUMAN_CONFIRMED_EDGES_ONLY", result: "EVIDENCE_CORRECT" }, { strategy: "C_DETERMINISTIC_PLUS_HUMAN_EDGES", result: "PREFERRED_AND_SELECTED" }, { strategy: "D_MACHINE_SAME_SPLIT_CONSTRAINTS", result: "NOT_AUTHORIZED" }, { strategy: "E_NO_ADDITIONAL_SEMANTIC_AUTHORITY", result: "INSUFFICIENT_KNOWN_HUMAN_LEAKAGE_EVIDENCE_EXISTS" }], findings: { selectedStrategy: MHS_V2_LEAKAGE_STRATEGY, collisionAuthorityRequired: true, collisionAuthorityValid: true, knownCollisionCount: 1, collisionDispositionedCount: 1, nonConflictingTrainAnchorCount: 1, exactDuplicateGroupCount: 0, normalizedDuplicateGroupCount: 0, sharedLineageGroupCount: 0, scopeAEdgeAuthorityCount: 7, scopeBAnchorAuthorityCount: 3, machineSemanticAuthorityCount: 0, graphEdgeCountCreatedInPhase: 0, componentCountCreatedInPhase: 0 }, boundaries: boundaries(), frozenAt: MHS_V2_LEAKAGE_FROZEN_AT };
  const artifact = { ...payload, analysisPayloadDigest: digest(payload) }; validateMhsV2LeakageControlAnalysis(artifact); return artifact;
};

export const createMhsV2LeakageControlCertification = (policy: MhsV2LeakageControlPolicyArtifact, analysis: MhsV2LeakageControlAnalysisArtifact): MhsV2LeakageControlCertificationArtifact => {
  validateMhsV2LeakageControlPolicy(policy); validateMhsV2LeakageControlAnalysis(analysis);
  const payload: MhsV2LeakageControlCertificationPayload = { schemaVersion: MHS_V2_LEAKAGE_CERTIFICATION_SCHEMA, certificationVersion: MHS_V2_LEAKAGE_VERSION, phase: "T6L-7K-A1R-C-R", status: "CERTIFIED", authorities: { ...authorities(), successorPolicySha256: sha256(Buffer.from(canonicalJson(policy), "utf8")), successorPolicyPayloadDigest: policy.policyPayloadDigest, consequenceAnalysisSha256: sha256(Buffer.from(canonicalJson(analysis), "utf8")), consequenceAnalysisPayloadDigest: analysis.analysisPayloadDigest }, result: { selectedStrategy: MHS_V2_LEAKAGE_STRATEGY, allowedEdgeAuthorities: MHS_V2_ALLOWED_EDGE_AUTHORITIES, prohibitedEdgeAuthorities: MHS_V2_PROHIBITED_EDGE_AUTHORITIES, humanDuplicateLikeTotal: 10, scopeAPositiveCount: 7, scopeBPositiveCount: 3, thresholdStatus: "NOT_REQUIRED_FOR_SELECTED_STRATEGY", noAdditionalHumanAnnotationRequiredForCurrentPipeline: true, nextPhaseAuthorized: "T6L-7K-B" }, validation: { deterministicReplayMatched: true, immutableAtomicPublication: true, overwriteRefusalVerified: true, upstreamAuthoritiesUnchanged: true }, boundaries: boundaries() };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2LeakageControlCertification(artifact); return artifact;
};

export const validateMhsV2LeakageControlPolicy = (artifact: MhsV2LeakageControlPolicyArtifact): void => { const { policyPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_LEAKAGE_POLICY_SCHEMA || artifact.policyVersion !== MHS_V2_LEAKAGE_VERSION || artifact.phase !== "T6L-7K-A1R-C-R" || artifact.status !== "IMMUTABLE_SUCCESSOR_LEAKAGE_CONTROL_POLICY" || canonicalJson(artifact.authorities) !== canonicalJson(authorities()) || artifact.selectedStrategy !== MHS_V2_LEAKAGE_STRATEGY || canonicalJson(artifact.allowedWithinV2EdgeAuthorities) !== canonicalJson(allowedAuthorities()) || canonicalJson(artifact.prohibitedEdgeAuthorities) !== canonicalJson(MHS_V2_PROHIBITED_EDGE_AUTHORITIES) || artifact.humanEvidence.duplicateLikeTotal !== 10 || artifact.humanEvidence.scopeAWithinV2Edges !== 7 || artifact.humanEvidence.scopeBHistoricalAnchors !== 3 || artifact.humanEvidence.unresolved !== 0 || artifact.threshold.historical0_85 !== "NOT_AUTHORIZED_FOR_MHS_V2" || artifact.threshold.successorNumericThreshold !== null || artifact.threshold.selectedStrategyThresholdStatus !== "NOT_REQUIRED_FOR_SELECTED_STRATEGY" || artifact.e5.operationalStatus !== "DIAGNOSTIC_ONLY" || artifact.e5.mayCreateEdge || artifact.e5.mayCreateSameSplitConstraint || artifact.historicalAnchors.historicalCandidatesMove || !artifact.precedence.collisionQuarantineOverridesOrdinaryAnchor || !artifact.precedence.futureProtectedContaminationExclusionOverridesPlacementAnchor || artifact.precedence.componentSplittingToSatisfyConflictsAllowed || artifact.labelPolicy.moderationLabelsPropagateAcrossEdges || !artifact.labelPolicy.mixedLabelsInsideComponentAllowed || artifact.semanticClaimSafety.transitiveConnectivityProvesPairwiseSemanticEquivalence || Object.values(artifact.boundaries).some(Boolean) || artifact.nextPhase !== "T6L-7K-B" || artifact.frozenAt !== MHS_V2_LEAKAGE_FROZEN_AT || policyPayloadDigest !== MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST || policyPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-C-R successor policy");
};
export const validateMhsV2LeakageControlAnalysis = (artifact: MhsV2LeakageControlAnalysisArtifact): void => { const { analysisPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_LEAKAGE_ANALYSIS_SCHEMA || artifact.analysisVersion !== MHS_V2_LEAKAGE_VERSION || artifact.phase !== "T6L-7K-A1R-C-R" || artifact.status !== "SUCCESSOR_STRATEGY_SELECTED" || canonicalJson(artifact.authorities) !== canonicalJson(authorities()) || artifact.strategies.length !== 5 || artifact.strategies[2].result !== "PREFERRED_AND_SELECTED" || artifact.findings.selectedStrategy !== MHS_V2_LEAKAGE_STRATEGY || artifact.findings.knownCollisionCount !== 1 || artifact.findings.collisionDispositionedCount !== 1 || artifact.findings.nonConflictingTrainAnchorCount !== 1 || artifact.findings.scopeAEdgeAuthorityCount !== 7 || artifact.findings.scopeBAnchorAuthorityCount !== 3 || artifact.findings.machineSemanticAuthorityCount !== 0 || artifact.findings.graphEdgeCountCreatedInPhase !== 0 || artifact.findings.componentCountCreatedInPhase !== 0 || Object.values(artifact.boundaries).some(Boolean) || artifact.frozenAt !== MHS_V2_LEAKAGE_FROZEN_AT || analysisPayloadDigest !== MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST || analysisPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-C-R consequence analysis");
};
export const validateMhsV2LeakageControlCertification = (artifact: MhsV2LeakageControlCertificationArtifact): void => { const { certificationPayloadDigest, ...payload } = artifact; const upstream = Object.fromEntries(Object.entries(artifact.authorities).filter(([key]) => !key.startsWith("successor") && !key.startsWith("consequence")));
  if (artifact.schemaVersion !== MHS_V2_LEAKAGE_CERTIFICATION_SCHEMA || artifact.certificationVersion !== MHS_V2_LEAKAGE_VERSION || artifact.phase !== "T6L-7K-A1R-C-R" || artifact.status !== "CERTIFIED" || canonicalJson(upstream) !== canonicalJson(authorities()) || artifact.authorities.successorPolicySha256 !== MHS_V2_LEAKAGE_POLICY_SHA256 || artifact.authorities.successorPolicyPayloadDigest !== MHS_V2_LEAKAGE_POLICY_PAYLOAD_DIGEST || artifact.authorities.consequenceAnalysisSha256 !== MHS_V2_LEAKAGE_ANALYSIS_SHA256 || artifact.authorities.consequenceAnalysisPayloadDigest !== MHS_V2_LEAKAGE_ANALYSIS_PAYLOAD_DIGEST || artifact.result.selectedStrategy !== MHS_V2_LEAKAGE_STRATEGY || canonicalJson(artifact.result.allowedEdgeAuthorities) !== canonicalJson(MHS_V2_ALLOWED_EDGE_AUTHORITIES) || canonicalJson(artifact.result.prohibitedEdgeAuthorities) !== canonicalJson(MHS_V2_PROHIBITED_EDGE_AUTHORITIES) || artifact.result.humanDuplicateLikeTotal !== 10 || artifact.result.scopeAPositiveCount !== 7 || artifact.result.scopeBPositiveCount !== 3 || artifact.result.thresholdStatus !== "NOT_REQUIRED_FOR_SELECTED_STRATEGY" || !artifact.result.noAdditionalHumanAnnotationRequiredForCurrentPipeline || artifact.result.nextPhaseAuthorized !== "T6L-7K-B" || Object.values(artifact.validation).some((value) => value !== true) || Object.values(artifact.boundaries).some(Boolean) || certificationPayloadDigest !== MHS_V2_LEAKAGE_CERTIFICATION_PAYLOAD_DIGEST || certificationPayloadDigest !== digest(payload) || /"text"\s*:/u.test(canonicalJson(artifact))) throw new Error("Invalid A1R-C-R certification");
};

type TriplePublisher = (policyTemporary: string, policyTarget: string, analysisTemporary: string, analysisTarget: string, certificationTemporary: string, certificationTarget: string) => void;
const defaultPublisher: TriplePublisher = (policyTemporary, policyTarget, analysisTemporary, analysisTarget, certificationTemporary, certificationTarget) => { fs.renameSync(policyTemporary, policyTarget); fs.renameSync(analysisTemporary, analysisTarget); fs.renameSync(certificationTemporary, certificationTarget); };
export const publishMhsV2LeakageControlAuthority = (policy: MhsV2LeakageControlPolicyArtifact, analysis: MhsV2LeakageControlAnalysisArtifact, certification: MhsV2LeakageControlCertificationArtifact, outputDirectory: string, publish: TriplePublisher = defaultPublisher): { readonly policyPath: string; readonly analysisPath: string; readonly certificationPath: string; readonly policySha256: string; readonly analysisSha256: string; readonly certificationSha256: string } => {
  validateMhsV2LeakageControlPolicy(policy); validateMhsV2LeakageControlAnalysis(analysis); validateMhsV2LeakageControlCertification(certification); const texts = [canonicalJson(policy), canonicalJson(analysis), canonicalJson(certification)] as const, targets = [path.join(outputDirectory, MHS_V2_LEAKAGE_POLICY_FILENAME), path.join(outputDirectory, MHS_V2_LEAKAGE_ANALYSIS_FILENAME), path.join(outputDirectory, MHS_V2_LEAKAGE_CERTIFICATION_FILENAME)] as const;
  if (targets.some((target) => fs.existsSync(target))) throw new Error("A1R-C-R successor authority exists; overwrite refused"); if (certification.authorities.successorPolicySha256 !== sha256(Buffer.from(texts[0], "utf8")) || certification.authorities.consequenceAnalysisSha256 !== sha256(Buffer.from(texts[1], "utf8"))) throw new Error("A1R-C-R certification binding mismatch");
  fs.mkdirSync(outputDirectory, { recursive: true }); const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, temporary = targets.map((target) => `${target}.${token}.partial`) as [string, string, string];
  try { temporary.forEach((filename, index) => fs.writeFileSync(filename, texts[index], { flag: "wx" })); publish(temporary[0], targets[0], temporary[1], targets[1], temporary[2], targets[2]); if (targets.some((target, index) => !fs.existsSync(target) || fs.readFileSync(target, "utf8") !== texts[index])) throw new Error("Incomplete A1R-C-R publication"); return { policyPath: targets[0], analysisPath: targets[1], certificationPath: targets[2], policySha256: sha256(Buffer.from(texts[0], "utf8")), analysisSha256: sha256(Buffer.from(texts[1], "utf8")), certificationSha256: sha256(Buffer.from(texts[2], "utf8")) }; }
  catch (error) { targets.forEach((target, index) => { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === texts[index]) fs.rmSync(target, { force: true }); }); throw error; }
  finally { temporary.forEach((filename) => fs.rmSync(filename, { force: true })); }
};
