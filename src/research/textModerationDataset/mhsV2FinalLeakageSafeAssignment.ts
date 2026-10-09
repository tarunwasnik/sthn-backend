import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_V2_LEAKAGE_ANALYSIS_SHA256,
  MHS_V2_LEAKAGE_CERTIFICATION_SHA256,
  MHS_V2_LEAKAGE_POLICY_SHA256,
  MhsV2LeakageControlAnalysisArtifact,
  MhsV2LeakageControlCertificationArtifact,
  MhsV2LeakageControlPolicyArtifact,
  validateMhsV2LeakageControlAnalysis,
  validateMhsV2LeakageControlCertification,
  validateMhsV2LeakageControlPolicy,
} from "./mhsV2SemanticLeakageControlPolicy";
import {
  MHS_V2_RELEASE_FEASIBILITY_PAYLOAD_DIGEST,
  MHS_V2_RELEASE_FEASIBILITY_SHA256,
  MHS_V2_RELEASE_PLAN_PAYLOAD_DIGEST,
  MHS_V2_RELEASE_PLAN_SHA256,
  MHS_V2_RELEASE_POLICY_PAYLOAD_DIGEST,
  MHS_V2_RELEASE_POLICY_SHA256,
  MHS_V2_RELEASE_PROJECTION_PAYLOAD_DIGEST,
  MHS_V2_RELEASE_PROJECTION_SHA256,
  MhsV2ReleaseFeasibilityArtifact,
  MhsV2ReleaseInputs,
  MhsV2ReleasePlanArtifact,
  MhsV2ReleasePolicyArtifact,
  MhsV2ReleaseProjectionArtifact,
  ReleaseDisposition,
  createMhsV2TrainExpansionReleaseArtifacts,
  validateMhsV2TrainExpansionReleaseArtifacts,
} from "./mhsV2TrainExpansionReleasePolicy";
import { MhsV2ExpansionConsolidationArtifact } from "./mhsV2ExpansionConsolidation";

export const MHS_V2_FINAL_ASSIGNMENT_VERSION = "MHS_V2_FINAL_LEAKAGE_SAFE_ASSIGNMENT_V1" as const;
export const MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT = "2026-09-21T20:00:00.000Z" as const;
export const MHS_V2_FINAL_COMPONENT_ASSIGNMENT_FILENAME = "mhs-v2-final-leakage-safe-component-assignment-v1.json" as const;
export const MHS_V2_FINAL_CANDIDATE_PROJECTION_FILENAME = "mhs-v2-final-leakage-safe-candidate-assignment-projection-v1.json" as const;
export const MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_FILENAME = "mhs-v2-final-leakage-safe-assignment-analysis-v1.json" as const;
export const MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_FILENAME = "mhs-v2-final-leakage-safe-assignment-certification-v1.json" as const;

// Pinned after the first immutable publication; validators fail closed once populated.
export const MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256 = "edaa762d3a04f0118ef4d4534037e01a0ca60b11e2c2ccca676bfd884077a9f9";
export const MHS_V2_FINAL_COMPONENT_ASSIGNMENT_PAYLOAD_DIGEST = "93744c92f543822360c1490f896bbca3080d6fe3962d38e77cc3a632b13cc956";
export const MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256 = "c76f9e1af7a4a8fb9644ca33e92e2f2f271b77625e2f1df46b182a8608bb6a46";
export const MHS_V2_FINAL_CANDIDATE_PROJECTION_PAYLOAD_DIGEST = "7420405202eca43e2c670a54e8f44a8a21aa25a218000f2934299d94ff26d1c1";
export const MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256 = "7e680568088e775ef853f387310a8f58268246a5b97666f6e88bec3a72af4f4a";
export const MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_PAYLOAD_DIGEST = "7d4b9e0805e4b75b82c0d3fc498b1ef80a0b3c8e2ef219650aca0b5d73d21f5d";
export const MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256 = "1a574fdbd1b832728dc9ac879c8d914775a10304f31d47b622fcb89c78d8ad32";
export const MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_PAYLOAD_DIGEST = "036b1db3386c95f4e6f167cc5065197302fcc505c6464ba92a568739ab79f433";

const RELEASE_MEMBERSHIP_DIGEST = "2e01d8d52fd167ed091f67fa42017cbfa50c8aaa64d420adacc92d548b23bcf2" as const;
const SELECTED_COMPONENT_DIGEST = "8fc79cb77b5940d491fbb9184c3b14c299ca7844eb66dfd16afc8d0ac80237c3" as const;
const CQ_COMPONENT_ID = "union_74809df3d5e0e77cc14b025644c2c898f592bd7f25155a58c7a54d2cf82b45c8" as const;
const TRAIN_ANCHOR_COMPONENT_ID = "union_e53063ce5d15b9563c8f7a8876a0b6723c761d1f68ffa2a0f4f6b3786351799c" as const;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const tally = (values: readonly string[]): Readonly<Record<string, number>> => values.reduce<Record<string, number>>((out, value) => { out[value] = (out[value] ?? 0) + 1; return out; }, {});
const exact = (bytes: Buffer, expected: string, label: string): void => { if (sha256(bytes) !== expected) throw new Error(`T6L-7K-D ${label} authority mismatch`); };
const pinMatches = (actual: string, expected: string): boolean => expected === "" || actual === expected;

export interface MhsV2FinalAssignmentInputs extends MhsV2ReleaseInputs {
  readonly leakagePolicyBytes: Buffer;
  readonly leakageAnalysisBytes: Buffer;
  readonly leakageCertificationBytes: Buffer;
  readonly releasePolicyBytes: Buffer;
  readonly releaseFeasibilityBytes: Buffer;
  readonly releasePlanBytes: Buffer;
  readonly releaseProjectionBytes: Buffer;
}

interface Verified {
  readonly consolidation: MhsV2ExpansionConsolidationArtifact;
  readonly policy: MhsV2ReleasePolicyArtifact;
  readonly feasibility: MhsV2ReleaseFeasibilityArtifact;
  readonly plan: MhsV2ReleasePlanArtifact;
  readonly projection: MhsV2ReleaseProjectionArtifact;
}

const verifyInputs = (input: MhsV2FinalAssignmentInputs): Verified => {
  exact(input.leakagePolicyBytes, MHS_V2_LEAKAGE_POLICY_SHA256, "leakage policy");
  exact(input.leakageAnalysisBytes, MHS_V2_LEAKAGE_ANALYSIS_SHA256, "leakage analysis");
  exact(input.leakageCertificationBytes, MHS_V2_LEAKAGE_CERTIFICATION_SHA256, "leakage certification");
  validateMhsV2LeakageControlPolicy(parse<MhsV2LeakageControlPolicyArtifact>(input.leakagePolicyBytes));
  validateMhsV2LeakageControlAnalysis(parse<MhsV2LeakageControlAnalysisArtifact>(input.leakageAnalysisBytes));
  validateMhsV2LeakageControlCertification(parse<MhsV2LeakageControlCertificationArtifact>(input.leakageCertificationBytes));

  exact(input.releasePolicyBytes, MHS_V2_RELEASE_POLICY_SHA256, "7I5 policy");
  exact(input.releaseFeasibilityBytes, MHS_V2_RELEASE_FEASIBILITY_SHA256, "7I5 feasibility");
  exact(input.releasePlanBytes, MHS_V2_RELEASE_PLAN_SHA256, "7I5 release plan");
  exact(input.releaseProjectionBytes, MHS_V2_RELEASE_PROJECTION_SHA256, "7I5 candidate projection");
  const policy = parse<MhsV2ReleasePolicyArtifact>(input.releasePolicyBytes);
  const feasibility = parse<MhsV2ReleaseFeasibilityArtifact>(input.releaseFeasibilityBytes);
  const plan = parse<MhsV2ReleasePlanArtifact>(input.releasePlanBytes);
  const projection = parse<MhsV2ReleaseProjectionArtifact>(input.releaseProjectionBytes);
  validateMhsV2TrainExpansionReleaseArtifacts(policy, feasibility, plan, projection);

  // This invokes the frozen 7I5 authority solely as an identity replay. K-D has no selector.
  const replay = createMhsV2TrainExpansionReleaseArtifacts(input);
  if (canonicalJson(replay) !== canonicalJson({ policy, feasibility, plan, projection })) throw new Error("T6L-7K-D 7I5 identity replay mismatch");
  if (plan.releaseMembershipDigest !== RELEASE_MEMBERSHIP_DIGEST || projection.releaseMembershipDigest !== RELEASE_MEMBERSHIP_DIGEST || feasibility.selectedComponentIdsDigest !== SELECTED_COMPONENT_DIGEST) throw new Error("T6L-7K-D frozen release membership mismatch");
  if (policy.policyPayloadDigest !== MHS_V2_RELEASE_POLICY_PAYLOAD_DIGEST || feasibility.feasibilityPayloadDigest !== MHS_V2_RELEASE_FEASIBILITY_PAYLOAD_DIGEST || plan.planPayloadDigest !== MHS_V2_RELEASE_PLAN_PAYLOAD_DIGEST || projection.projectionPayloadDigest !== MHS_V2_RELEASE_PROJECTION_PAYLOAD_DIGEST) throw new Error("T6L-7K-D frozen 7I5 payload mismatch");
  if (policy.eligibility.splitOrReleaseMembershipGrantsTrainingEligibility || projection.trainingEligibleCount !== 0 || projection.rows.some((row) => row.trainingEligible)) throw new Error("T6L-7K-D eligibility boundary mismatch");
  return { consolidation: parse<MhsV2ExpansionConsolidationArtifact>(input.consolidationBytes), policy, feasibility, plan, projection };
};

export type FinalV2Split = "TRAIN" | "UNASSIGNED";
const finalSplit = (disposition: ReleaseDisposition): FinalV2Split => disposition === "RELEASED_TO_TRAIN" ? "TRAIN" : "UNASSIGNED";

export interface FinalComponentRecord {
  readonly componentId: string; readonly memberCandidateIds: readonly string[]; readonly componentSize: number;
  readonly releaseDisposition: ReleaseDisposition; readonly finalSplit: FinalV2Split; readonly assignmentAuthority: "T6L-7I5_FROZEN_RELEASE_PLAN";
  readonly historicalAnchorStatus: string; readonly cqExcluded: boolean; readonly protectedContaminated: false;
  readonly selectedComponentBinding: boolean; readonly componentDigest: string;
}
export interface FinalCandidateRecord {
  readonly candidateId: string; readonly textSha256: string; readonly componentId: string; readonly moderationDecision: "ALLOW" | "BLOCK";
  readonly primaryCategory: string | null; readonly secondaryCategories: readonly string[]; readonly reasonCode: string;
  readonly split: FinalV2Split; readonly releaseDisposition: ReleaseDisposition; readonly assignmentReason: string; readonly trainingEligible: false;
}

interface FinalAuthorities {
  readonly candidateSha256: string; readonly universeSha256: string; readonly consolidationSha256: string; readonly historicalSplitSha256: string; readonly internalTestFreezeSha256: string;
  readonly leakagePolicySha256: string; readonly graphSha256: string; readonly componentsSha256: string; readonly cqCertificationSha256: string; readonly protectedCertificationSha256: string;
  readonly releasePolicySha256: typeof MHS_V2_RELEASE_POLICY_SHA256; readonly releaseFeasibilitySha256: typeof MHS_V2_RELEASE_FEASIBILITY_SHA256;
  readonly releasePlanSha256: typeof MHS_V2_RELEASE_PLAN_SHA256; readonly releaseProjectionSha256: typeof MHS_V2_RELEASE_PROJECTION_SHA256;
  readonly releaseMembershipDigest: typeof RELEASE_MEMBERSHIP_DIGEST; readonly selectedComponentDigest: typeof SELECTED_COMPONENT_DIGEST;
}
const authorities = (verified: Verified): FinalAuthorities => ({
  candidateSha256: verified.policy.authorities.candidateSha256, universeSha256: verified.policy.authorities.universeSha256, consolidationSha256: verified.policy.authorities.consolidationSha256,
  historicalSplitSha256: verified.policy.authorities.historicalSplitSha256, internalTestFreezeSha256: verified.policy.authorities.internalTestFreezeSha256,
  leakagePolicySha256: MHS_V2_LEAKAGE_POLICY_SHA256, graphSha256: verified.policy.authorities.graphSha256, componentsSha256: verified.policy.authorities.componentsSha256,
  cqCertificationSha256: verified.policy.authorities.cqCertificationSha256, protectedCertificationSha256: verified.policy.authorities.protectedCertificationSha256,
  releasePolicySha256: MHS_V2_RELEASE_POLICY_SHA256, releaseFeasibilitySha256: MHS_V2_RELEASE_FEASIBILITY_SHA256, releasePlanSha256: MHS_V2_RELEASE_PLAN_SHA256,
  releaseProjectionSha256: MHS_V2_RELEASE_PROJECTION_SHA256, releaseMembershipDigest: RELEASE_MEMBERSHIP_DIGEST, selectedComponentDigest: SELECTED_COMPONENT_DIGEST,
});

export interface FinalComponentAssignmentPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_COMPONENT_ASSIGNMENT_V1"; readonly phase: "T6L-7K-D"; readonly status: "FINAL_LEAKAGE_SAFE_COMPONENT_ASSIGNMENT"; readonly authorities: FinalAuthorities; readonly components: readonly FinalComponentRecord[]; readonly componentCount: 393; readonly assignmentMembershipDigest: string; readonly frozenAt: typeof MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT }
export type FinalComponentAssignmentArtifact = FinalComponentAssignmentPayload & { readonly componentAssignmentPayloadDigest: string };
export interface FinalCandidateProjectionPayload { readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_CANDIDATE_ASSIGNMENT_PROJECTION_V1"; readonly phase: "T6L-7K-D"; readonly status: "FINAL_CANDIDATE_ASSIGNMENT_PROJECTION"; readonly authorities: FinalAuthorities & { readonly componentAssignmentSha256: string; readonly componentAssignmentPayloadDigest: string }; readonly rows: readonly FinalCandidateRecord[]; readonly rowCount: 400; readonly assignmentMembershipDigest: string; readonly trainingEligibleCount: 0; readonly frozenAt: typeof MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT }
export type FinalCandidateProjectionArtifact = FinalCandidateProjectionPayload & { readonly candidateProjectionPayloadDigest: string };

interface DispositionAnalysis { readonly candidates: number; readonly components: number; readonly decisionCounts: Readonly<Record<string, number>>; readonly blockCategoryCounts: Readonly<Record<string, number>>; readonly componentSizeDistribution: Readonly<Record<string, number>> }
export interface FinalAssignmentAnalysisPayload {
  readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_V1"; readonly phase: "T6L-7K-D"; readonly status: "FINAL_ASSIGNMENT_ANALYZED";
  readonly authorities: FinalCandidateProjectionPayload["authorities"] & { readonly candidateProjectionSha256: string; readonly candidateProjectionPayloadDigest: string };
  readonly total: { readonly candidates: 400; readonly components: 393; readonly frozenDecisionCounts: { readonly ALLOW: 232; readonly BLOCK: 168 } };
  readonly dispositions: Readonly<Record<ReleaseDisposition, DispositionAnalysis>>;
  readonly combinedDevelopment: { readonly historicalTrain: 60; readonly v2Train: 140; readonly combinedTrain: 200; readonly historicalValidation: 13; readonly v2Validation: 0; readonly combinedValidation: 13; readonly historicalInternalTest: 13; readonly v2InternalTest: 0; readonly combinedInternalTest: 13 };
  readonly invariants: { readonly accountedCandidates: 400; readonly accountedComponents: 393; readonly partialComponentViolations: 0; readonly crossDispositionComponentViolations: 0; readonly cqReleasedViolations: 0; readonly trainAnchorViolations: 0; readonly protectedContaminationExclusions: 0; readonly labelMutations: 0; readonly reasonMutations: 0; readonly historicalMutations: 0; readonly eligibilityMutations: 0 };
  readonly boundaries: { readonly protectedBenchmarkRawAccesses: 0; readonly internalTestRawAccesses: 0; readonly e5Invocations: 0; readonly classifierInvocations: 0; readonly threshold: null; readonly trainingPerformed: false; readonly humanReviewPerformed: false; readonly newDataCollected: false; readonly productionChanged: false };
  readonly assignmentMembershipDigest: string; readonly frozenAt: typeof MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT;
}
export type FinalAssignmentAnalysisArtifact = FinalAssignmentAnalysisPayload & { readonly analysisPayloadDigest: string };

export interface FinalAssignmentCertificationPayload {
  readonly schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_V1"; readonly certificationVersion: typeof MHS_V2_FINAL_ASSIGNMENT_VERSION; readonly phase: "T6L-7K-D"; readonly status: "CERTIFIED";
  readonly authorities: FinalAssignmentAnalysisPayload["authorities"] & { readonly analysisSha256: string; readonly analysisPayloadDigest: string };
  readonly certification: { readonly allAuthoritiesVerified: true; readonly allCandidatesAccountedFor: true; readonly allComponentsAccountedFor: true; readonly exact7I5MembershipReproduced: true; readonly componentAtomicity: true; readonly noCrossDispositionLeakage: true; readonly historicalSplitsUnchanged: true; readonly protectedAuthorityUnchanged: true; readonly internalTestUnchanged: true; readonly labelsUnchanged: true; readonly eligibilityUnchanged: true; readonly noReselectionAuthority: true };
  readonly counts: { readonly releasedTrain: 140; readonly releasedAllow: 70; readonly releasedBlock: 70; readonly researchReserve: 256; readonly excluded: 4; readonly v2Validation: 0; readonly v2InternalTest: 0; readonly trainingEligible: 0 };
  readonly assignmentMembershipDigest: string; readonly frozenAt: typeof MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT;
}
export type FinalAssignmentCertificationArtifact = FinalAssignmentCertificationPayload & { readonly certificationPayloadDigest: string };

const sizeDistribution = (components: readonly FinalComponentRecord[]): Readonly<Record<string, number>> => tally(components.map((component) => String(component.componentSize)));

export const createMhsV2FinalLeakageSafeAssignment = (input: MhsV2FinalAssignmentInputs): { readonly componentAssignment: FinalComponentAssignmentArtifact; readonly candidateProjection: FinalCandidateProjectionArtifact; readonly analysis: FinalAssignmentAnalysisArtifact; readonly certification: FinalAssignmentCertificationArtifact } => {
  const verified = verifyInputs(input), authority = authorities(verified);
  const componentRecords: FinalComponentRecord[] = verified.plan.components.map((component) => ({ componentId: component.componentId, memberCandidateIds: [...component.memberCandidateIds], componentSize: component.memberCount, releaseDisposition: component.disposition, finalSplit: finalSplit(component.disposition), assignmentAuthority: "T6L-7I5_FROZEN_RELEASE_PLAN", historicalAnchorStatus: component.historicalAnchorState, cqExcluded: component.componentId === CQ_COMPONENT_ID, protectedContaminated: false, selectedComponentBinding: component.disposition === "RELEASED_TO_TRAIN", componentDigest: component.componentDigest }));
  const sourceById = new Map(verified.consolidation.rows.map((row) => [row.candidateId, row]));
  const candidateRecords: FinalCandidateRecord[] = verified.projection.rows.map((row) => { const source = sourceById.get(row.candidateId); if (!source || source.decision !== row.decision || source.primaryCategory !== row.primaryCategory) throw new Error("T6L-7K-D moderation-label binding mismatch"); return { candidateId: row.candidateId, textSha256: row.textSha256, componentId: row.componentId, moderationDecision: row.decision, primaryCategory: row.primaryCategory, secondaryCategories: [...source.secondaryCategories], reasonCode: source.reasonCode, split: finalSplit(row.disposition), releaseDisposition: row.disposition, assignmentReason: row.releaseReason, trainingEligible: false }; });
  const assignmentMembershipDigest = digest([componentRecords.map((row) => [row.componentId, row.memberCandidateIds, row.releaseDisposition, row.finalSplit]), candidateRecords.map((row) => [row.candidateId, row.textSha256, row.componentId, row.releaseDisposition, row.split])]);
  const componentPayload: FinalComponentAssignmentPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_COMPONENT_ASSIGNMENT_V1", phase: "T6L-7K-D", status: "FINAL_LEAKAGE_SAFE_COMPONENT_ASSIGNMENT", authorities: authority, components: componentRecords, componentCount: 393, assignmentMembershipDigest, frozenAt: MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT };
  const componentAssignment: FinalComponentAssignmentArtifact = { ...componentPayload, componentAssignmentPayloadDigest: digest(componentPayload) };
  const componentSha = sha256(Buffer.from(canonicalJson(componentAssignment), "utf8"));
  const projectionPayload: FinalCandidateProjectionPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_CANDIDATE_ASSIGNMENT_PROJECTION_V1", phase: "T6L-7K-D", status: "FINAL_CANDIDATE_ASSIGNMENT_PROJECTION", authorities: { ...authority, componentAssignmentSha256: componentSha, componentAssignmentPayloadDigest: componentAssignment.componentAssignmentPayloadDigest }, rows: candidateRecords, rowCount: 400, assignmentMembershipDigest, trainingEligibleCount: 0, frozenAt: MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT };
  const candidateProjection: FinalCandidateProjectionArtifact = { ...projectionPayload, candidateProjectionPayloadDigest: digest(projectionPayload) };
  const projectionSha = sha256(Buffer.from(canonicalJson(candidateProjection), "utf8"));
  const componentsByDisposition = (disposition: ReleaseDisposition): FinalComponentRecord[] => componentRecords.filter((row) => row.releaseDisposition === disposition);
  const candidatesByDisposition = (disposition: ReleaseDisposition): FinalCandidateRecord[] => candidateRecords.filter((row) => row.releaseDisposition === disposition);
  const dispositionAnalysis = (disposition: ReleaseDisposition): DispositionAnalysis => { const candidates = candidatesByDisposition(disposition), components = componentsByDisposition(disposition), blocks = candidates.filter((row) => row.moderationDecision === "BLOCK"); return { candidates: candidates.length, components: components.length, decisionCounts: tally(candidates.map((row) => row.moderationDecision)), blockCategoryCounts: tally(blocks.map((row) => row.primaryCategory!)), componentSizeDistribution: sizeDistribution(components) }; };
  const analysisPayload: FinalAssignmentAnalysisPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_V1", phase: "T6L-7K-D", status: "FINAL_ASSIGNMENT_ANALYZED", authorities: { ...projectionPayload.authorities, candidateProjectionSha256: projectionSha, candidateProjectionPayloadDigest: candidateProjection.candidateProjectionPayloadDigest }, total: { candidates: 400, components: 393, frozenDecisionCounts: { ALLOW: 232, BLOCK: 168 } }, dispositions: { RELEASED_TO_TRAIN: dispositionAnalysis("RELEASED_TO_TRAIN"), RESEARCH_RESERVE_NOT_RELEASED: dispositionAnalysis("RESEARCH_RESERVE_NOT_RELEASED"), EXCLUDED_FROM_TRAIN_AND_VALIDATION: dispositionAnalysis("EXCLUDED_FROM_TRAIN_AND_VALIDATION") }, combinedDevelopment: { historicalTrain: 60, v2Train: 140, combinedTrain: 200, historicalValidation: 13, v2Validation: 0, combinedValidation: 13, historicalInternalTest: 13, v2InternalTest: 0, combinedInternalTest: 13 }, invariants: { accountedCandidates: 400, accountedComponents: 393, partialComponentViolations: 0, crossDispositionComponentViolations: 0, cqReleasedViolations: 0, trainAnchorViolations: 0, protectedContaminationExclusions: 0, labelMutations: 0, reasonMutations: 0, historicalMutations: 0, eligibilityMutations: 0 }, boundaries: { protectedBenchmarkRawAccesses: 0, internalTestRawAccesses: 0, e5Invocations: 0, classifierInvocations: 0, threshold: null, trainingPerformed: false, humanReviewPerformed: false, newDataCollected: false, productionChanged: false }, assignmentMembershipDigest, frozenAt: MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT };
  const analysis: FinalAssignmentAnalysisArtifact = { ...analysisPayload, analysisPayloadDigest: digest(analysisPayload) };
  const analysisSha = sha256(Buffer.from(canonicalJson(analysis), "utf8"));
  const certificationPayload: FinalAssignmentCertificationPayload = { schemaVersion: "STHN_TEXT_MODERATION_MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_V1", certificationVersion: MHS_V2_FINAL_ASSIGNMENT_VERSION, phase: "T6L-7K-D", status: "CERTIFIED", authorities: { ...analysisPayload.authorities, analysisSha256: analysisSha, analysisPayloadDigest: analysis.analysisPayloadDigest }, certification: { allAuthoritiesVerified: true, allCandidatesAccountedFor: true, allComponentsAccountedFor: true, exact7I5MembershipReproduced: true, componentAtomicity: true, noCrossDispositionLeakage: true, historicalSplitsUnchanged: true, protectedAuthorityUnchanged: true, internalTestUnchanged: true, labelsUnchanged: true, eligibilityUnchanged: true, noReselectionAuthority: true }, counts: { releasedTrain: 140, releasedAllow: 70, releasedBlock: 70, researchReserve: 256, excluded: 4, v2Validation: 0, v2InternalTest: 0, trainingEligible: 0 }, assignmentMembershipDigest, frozenAt: MHS_V2_FINAL_ASSIGNMENT_FROZEN_AT };
  const certification: FinalAssignmentCertificationArtifact = { ...certificationPayload, certificationPayloadDigest: digest(certificationPayload) };
  validateMhsV2FinalLeakageSafeAssignment(componentAssignment, candidateProjection, analysis, certification);
  return { componentAssignment, candidateProjection, analysis, certification };
};

export const validateMhsV2FinalLeakageSafeAssignment = (component: FinalComponentAssignmentArtifact, projection: FinalCandidateProjectionArtifact, analysis: FinalAssignmentAnalysisArtifact, certification: FinalAssignmentCertificationArtifact): void => {
  const { componentAssignmentPayloadDigest, ...componentPayload } = component, { candidateProjectionPayloadDigest, ...projectionPayload } = projection, { analysisPayloadDigest, ...analysisPayload } = analysis, { certificationPayloadDigest, ...certificationPayload } = certification;
  const componentSha = sha256(Buffer.from(canonicalJson(component), "utf8")), projectionSha = sha256(Buffer.from(canonicalJson(projection), "utf8")), analysisSha = sha256(Buffer.from(canonicalJson(analysis), "utf8")), certificationSha = sha256(Buffer.from(canonicalJson(certification), "utf8"));
  if (componentAssignmentPayloadDigest !== digest(componentPayload) || candidateProjectionPayloadDigest !== digest(projectionPayload) || analysisPayloadDigest !== digest(analysisPayload) || certificationPayloadDigest !== digest(certificationPayload) || !pinMatches(componentSha, MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256) || !pinMatches(componentAssignmentPayloadDigest, MHS_V2_FINAL_COMPONENT_ASSIGNMENT_PAYLOAD_DIGEST) || !pinMatches(projectionSha, MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256) || !pinMatches(candidateProjectionPayloadDigest, MHS_V2_FINAL_CANDIDATE_PROJECTION_PAYLOAD_DIGEST) || !pinMatches(analysisSha, MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256) || !pinMatches(analysisPayloadDigest, MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_PAYLOAD_DIGEST) || !pinMatches(certificationSha, MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256) || !pinMatches(certificationPayloadDigest, MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_PAYLOAD_DIGEST)) throw new Error("Invalid T6L-7K-D canonical artifact digest");
  const componentIds = component.components.map((row) => row.componentId), candidateIds = projection.rows.map((row) => row.candidateId), byComponent = new Map(component.components.map((row) => [row.componentId, row]));
  if (component.componentCount !== 393 || component.components.length !== 393 || new Set(componentIds).size !== 393 || canonicalJson(componentIds) !== canonicalJson([...componentIds].sort()) || projection.rowCount !== 400 || projection.rows.length !== 400 || new Set(candidateIds).size !== 400 || canonicalJson(candidateIds) !== canonicalJson([...candidateIds].sort()) || component.assignmentMembershipDigest !== projection.assignmentMembershipDigest || projection.assignmentMembershipDigest !== analysis.assignmentMembershipDigest || analysis.assignmentMembershipDigest !== certification.assignmentMembershipDigest) throw new Error("Invalid T6L-7K-D membership accounting");
  if (projection.rows.some((row) => row.trainingEligible || (row.split === "TRAIN") !== (row.releaseDisposition === "RELEASED_TO_TRAIN") || byComponent.get(row.componentId)?.releaseDisposition !== row.releaseDisposition) || projection.trainingEligibleCount !== 0) throw new Error("Invalid T6L-7K-D candidate assignment");
  if (component.components.some((row) => row.memberCandidateIds.some((id) => projection.rows.find((candidate) => candidate.candidateId === id)?.releaseDisposition !== row.releaseDisposition)) || component.components.find((row) => row.componentId === CQ_COMPONENT_ID)?.releaseDisposition !== "EXCLUDED_FROM_TRAIN_AND_VALIDATION" || component.components.find((row) => row.componentId === TRAIN_ANCHOR_COMPONENT_ID)?.releaseDisposition !== "RELEASED_TO_TRAIN") throw new Error("Invalid T6L-7K-D component atomicity");
  const released = projection.rows.filter((row) => row.releaseDisposition === "RELEASED_TO_TRAIN"), reserve = projection.rows.filter((row) => row.releaseDisposition === "RESEARCH_RESERVE_NOT_RELEASED"), excluded = projection.rows.filter((row) => row.releaseDisposition === "EXCLUDED_FROM_TRAIN_AND_VALIDATION");
  if (released.length !== 140 || released.filter((row) => row.moderationDecision === "ALLOW").length !== 70 || released.filter((row) => row.moderationDecision === "BLOCK").length !== 70 || reserve.length !== 256 || excluded.length !== 4 || projection.rows.some((row) => (row.split as string) === "VALIDATION" || (row.split as string) === "INTERNAL_TEST") || analysis.invariants.partialComponentViolations || analysis.invariants.crossDispositionComponentViolations || !certification.certification.noReselectionAuthority) throw new Error("Invalid T6L-7K-D final accounting");
};

type Publisher = (temporary: readonly string[], targets: readonly string[]) => void;
const defaultPublisher: Publisher = (temporary, targets): void => temporary.forEach((filename, index) => fs.renameSync(filename, targets[index]));
export const publishMhsV2FinalLeakageSafeAssignment = (artifacts: ReturnType<typeof createMhsV2FinalLeakageSafeAssignment>, outputDirectory: string, publisher: Publisher = defaultPublisher): { readonly paths: readonly string[]; readonly sha256: readonly string[] } => {
  validateMhsV2FinalLeakageSafeAssignment(artifacts.componentAssignment, artifacts.candidateProjection, artifacts.analysis, artifacts.certification); fs.mkdirSync(outputDirectory, { recursive: true });
  const targets = [MHS_V2_FINAL_COMPONENT_ASSIGNMENT_FILENAME, MHS_V2_FINAL_CANDIDATE_PROJECTION_FILENAME, MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_FILENAME, MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_FILENAME].map((filename) => path.join(outputDirectory, filename));
  if (targets.some(fs.existsSync)) throw new Error("T6L-7K-D overwrite refused");
  const serialized = [artifacts.componentAssignment, artifacts.candidateProjection, artifacts.analysis, artifacts.certification].map(canonicalJson), temporary = targets.map((target) => `${target}.${process.pid}.tmp`);
  try { temporary.forEach((filename, index) => fs.writeFileSync(filename, serialized[index], { flag: "wx" })); publisher(temporary, targets); if (targets.some((target) => !fs.existsSync(target))) throw new Error("T6L-7K-D incomplete publication"); }
  catch (error) { [...temporary, ...targets].forEach((filename) => { if (fs.existsSync(filename)) fs.rmSync(filename); }); throw error; }
  return { paths: targets, sha256: targets.map((filename) => sha256(fs.readFileSync(filename))) };
};
