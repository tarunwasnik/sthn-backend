import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import {
  MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST,
  MHS_RELEASE_MANIFEST_SHA256,
  MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST,
  MHS_ELIGIBILITY_MANIFEST_SHA256,
} from "./mhsDevelopmentProjection";
import {
  MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST,
  MHS_R_ELIGIBILITY_PLAN_SHA256,
  MhsReleaseManifestArtifact,
  MhsTrainingEligibilityManifestArtifact,
  validateMhsReleaseManifestArtifact,
  validateMhsTrainingEligibilityManifestArtifact,
} from "./mhsDatasetRelease";
import { MHS_SPLIT_MANIFEST_SHA256, MhsInternalTestFreezeArtifact, validateMhsInternalTestFreezeArtifact } from "./mhsInternalTestFreeze";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "./mhsV2SemanticCalibrationPolicy";
import { MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";
import {
  MHS_V2_RELEASE_FEASIBILITY_SHA256, MHS_V2_RELEASE_PLAN_SHA256, MHS_V2_RELEASE_POLICY_SHA256, MHS_V2_RELEASE_PROJECTION_SHA256,
  MhsV2ReleaseFeasibilityArtifact, MhsV2ReleasePlanArtifact, MhsV2ReleasePolicyArtifact, MhsV2ReleaseProjectionArtifact,
  validateMhsV2TrainExpansionReleaseArtifacts,
} from "./mhsV2TrainExpansionReleasePolicy";
import {
  MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256, MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256,
  MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256, MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256,
  FinalAssignmentAnalysisArtifact, FinalAssignmentCertificationArtifact, FinalCandidateProjectionArtifact, FinalComponentAssignmentArtifact,
  validateMhsV2FinalLeakageSafeAssignment,
} from "./mhsV2FinalLeakageSafeAssignment";
import { MHS_V2_EXPANSION_CANDIDATE_SHA256 } from "./mhsV2ExpansionCandidateAcquisition";
import { MHS_V2_REVIEW_UNIVERSE_SHA256 } from "./mhsV2ExpansionReviewerA";
import { MHS_V2_EXPANSION_CONSOLIDATION_SHA256 } from "./mhsV2ExpansionConsolidation";
import { MHS_V2_LEAKAGE_POLICY_SHA256 } from "./mhsV2SemanticLeakageControlPolicy";
import { MHS_V2_LEAKAGE_COMPONENTS_SHA256, MHS_V2_LEAKAGE_GRAPH_SHA256 } from "./mhsV2SemanticLeakageGraph";
import { MHS_V2_COLLISION_CERTIFICATION_SHA256 } from "./mhsV2HistoricalSplitAnchorCollision";
import { PROTECTED_V2_CERTIFICATION_SHA256 } from "../../evaluation/textModeration/protectedV2ContaminationAuthority";
import { assertRegistries, licenseRegistry, requireTrainingSource } from "./registries";

export const MHS_COMBINED_DATASET_VERSION = "STHN_TEXT_MODERATION_DATASET_MHS_V2" as const;
export const MHS_COMBINED_RELEASE_VERSION = "MHS_DATASET_RELEASE_V2" as const;
export const MHS_COMBINED_ELIGIBILITY_MANIFEST_VERSION = "MHS_TRAINING_ELIGIBILITY_MANIFEST_V2" as const;
export const MHS_COMBINED_RELEASE_SCHEMA = "STHN_TEXT_MODERATION_MHS_RELEASE_MANIFEST_V2" as const;
export const MHS_COMBINED_ELIGIBILITY_SCHEMA = "STHN_TEXT_MODERATION_MHS_TRAINING_ELIGIBILITY_MANIFEST_V2" as const;
export const MHS_COMBINED_RELEASE_FILENAME = "mhs-release-manifest-v2.json" as const;
export const MHS_COMBINED_ELIGIBILITY_FILENAME = "mhs-training-eligibility-manifest-v2.json" as const;
export const MHS_COMBINED_FROZEN_AT = "2026-09-22T00:00:00.000Z" as const;

export const MHS_COMBINED_RELEASE_SHA256 = "a001c63cf1d4674d9dcad89c9e630348ce3e1461a6e8cd12971b813724e65ec7";
export const MHS_COMBINED_RELEASE_PAYLOAD_DIGEST = "1575c609b85dcbfdd164099ce7fb13901226d60a261958ea8aa16cf8d5c8e9a4";
export const MHS_COMBINED_ELIGIBILITY_SHA256 = "1201be0665a82b03ab9e056e8bad16737afaf8cf6159602fde3ecf8cf00d7649";
export const MHS_COMBINED_ELIGIBILITY_PAYLOAD_DIGEST = "05b9d74d3b2ae0c8166d50eb5ee79000ba51341a7d8356ddda43a3fc627b1588";

const K_D_ASSIGNMENT_DIGEST = "f9ca44ba63979d998f85ef83d7aad88de5fd743ccb2d1da71572d76fe8322cec" as const;
const I5_RELEASE_MEMBERSHIP_DIGEST = "2e01d8d52fd167ed091f67fa42017cbfa50c8aaa64d420adacc92d548b23bcf2" as const;
const I5_SELECTED_COMPONENT_DIGEST = "8fc79cb77b5940d491fbb9184c3b14c299ca7844eb66dfd16afc8d0ac80237c3" as const;
const BENCHMARK_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747" as const;
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString("utf8")) as T;
const exact = (bytes: Buffer, expected: string, label: string): void => { if (sha256(bytes) !== expected) throw new Error(`T6L-8A0 ${label} authority mismatch`); };
const exactPayloadDigest = (bytes: Buffer, field: string, label: string): void => {
  const artifact = parse<Record<string, unknown>>(bytes), claimed = artifact[field];
  delete artifact[field];
  if (typeof claimed !== "string" || claimed !== digest(artifact)) throw new Error(`T6L-8A0 ${label} payload mismatch`);
};
const pinMatches = (actual: string, expected: string): boolean => expected === "" || actual === expected;
const SOURCE_REVISION: MhsCombinedEligibilityEntry["sourceRevision"] = "5468f6e118396646b02a2f691e771f6b6d9502ea";
const EXPECTED_COMBINED_BLOCK_CATEGORIES = { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 } as const;

export interface MhsCombinedReleaseInputs {
  readonly oldReleaseBytes: Buffer; readonly oldEligibilityBytes: Buffer; readonly oldEligibilityPlanBytes: Buffer;
  readonly historicalSplitBytes: Buffer; readonly internalTestFreezeBytes: Buffer;
  readonly candidateBytes: Buffer; readonly universeBytes: Buffer; readonly consolidationBytes: Buffer; readonly leakagePolicyBytes: Buffer;
  readonly graphBytes: Buffer; readonly componentsBytes: Buffer; readonly cqCertificationBytes: Buffer; readonly protectedCertificationBytes: Buffer;
  readonly releasePolicyBytes: Buffer; readonly releaseFeasibilityBytes: Buffer; readonly releasePlanBytes: Buffer; readonly releaseProjectionBytes: Buffer;
  readonly componentAssignmentBytes: Buffer; readonly candidateAssignmentBytes: Buffer; readonly assignmentAnalysisBytes: Buffer; readonly assignmentCertificationBytes: Buffer;
}

export type CombinedOrigin = "HISTORICAL_MHS_V1" | "MHS_V2_EXPANSION";
export interface MhsCombinedEligibilityEntry {
  readonly candidateId: string; readonly candidateTextDigest: string; readonly split: "TRAIN" | "VALIDATION";
  readonly eligibility: "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED"; readonly origin: CombinedOrigin;
  readonly sourceId: "MEASURING_HATE_SPEECH"; readonly sourceRevision: "5468f6e118396646b02a2f691e771f6b6d9502ea";
  readonly evidenceDigest: string; readonly releaseVersion: typeof MHS_COMBINED_RELEASE_VERSION; readonly datasetVersion: typeof MHS_COMBINED_DATASET_VERSION;
}

interface CombinedAuthorities {
  readonly oldReleaseSha256: typeof MHS_RELEASE_MANIFEST_SHA256; readonly oldReleasePayloadDigest: typeof MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST;
  readonly oldEligibilitySha256: typeof MHS_ELIGIBILITY_MANIFEST_SHA256; readonly oldEligibilityPayloadDigest: typeof MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST;
  readonly oldEligibilityPlanSha256: typeof MHS_R_ELIGIBILITY_PLAN_SHA256; readonly oldEligibilityPlanPayloadDigest: typeof MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST;
  readonly historicalSplitSha256: typeof MHS_SPLIT_MANIFEST_SHA256; readonly internalTestFreezeSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256;
  readonly v2CandidateSha256: typeof MHS_V2_EXPANSION_CANDIDATE_SHA256; readonly v2UniverseSha256: typeof MHS_V2_REVIEW_UNIVERSE_SHA256; readonly v2ConsolidationSha256: typeof MHS_V2_EXPANSION_CONSOLIDATION_SHA256;
  readonly leakagePolicySha256: typeof MHS_V2_LEAKAGE_POLICY_SHA256; readonly graphSha256: typeof MHS_V2_LEAKAGE_GRAPH_SHA256; readonly componentsSha256: typeof MHS_V2_LEAKAGE_COMPONENTS_SHA256;
  readonly cqCertificationSha256: typeof MHS_V2_COLLISION_CERTIFICATION_SHA256; readonly protectedCertificationSha256: typeof PROTECTED_V2_CERTIFICATION_SHA256;
  readonly i5PolicySha256: typeof MHS_V2_RELEASE_POLICY_SHA256; readonly i5FeasibilitySha256: typeof MHS_V2_RELEASE_FEASIBILITY_SHA256; readonly i5PlanSha256: typeof MHS_V2_RELEASE_PLAN_SHA256; readonly i5ProjectionSha256: typeof MHS_V2_RELEASE_PROJECTION_SHA256;
  readonly kdComponentAssignmentSha256: typeof MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256; readonly kdCandidateAssignmentSha256: typeof MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256; readonly kdAnalysisSha256: typeof MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256; readonly kdCertificationSha256: typeof MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256;
  readonly kdAssignmentMembershipDigest: typeof K_D_ASSIGNMENT_DIGEST; readonly i5ReleaseMembershipDigest: typeof I5_RELEASE_MEMBERSHIP_DIGEST; readonly i5SelectedComponentDigest: typeof I5_SELECTED_COMPONENT_DIGEST;
}

export interface MhsCombinedEligibilityPayload {
  readonly schemaVersion: typeof MHS_COMBINED_ELIGIBILITY_SCHEMA; readonly manifestVersion: typeof MHS_COMBINED_ELIGIBILITY_MANIFEST_VERSION; readonly phase: "T6L-8A0"; readonly status: "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY";
  readonly datasetVersion: typeof MHS_COMBINED_DATASET_VERSION; readonly releaseVersion: typeof MHS_COMBINED_RELEASE_VERSION; readonly releaseAuthorityId: string; readonly authorities: CombinedAuthorities;
  readonly entries: readonly MhsCombinedEligibilityEntry[];
  readonly membershipDigests: { readonly train: string; readonly validation: string; readonly development: string; readonly eligibility: string };
  readonly counts: { readonly trainingEligible: 200; readonly validationAuthorized: 13; readonly historicalTrain: 60; readonly v2Train: 140; readonly v2Validation: 0; readonly protectedInternalTest: 13; readonly reserveUnauthorized: 256; readonly excludedUnauthorized: 4; readonly duplicateEntries: 0; readonly unknownEntries: 0 };
  readonly sealedEvaluation: { readonly internalTest: { readonly count: 13; readonly rawContentIncluded: false }; readonly externalBenchmark: { readonly version: "STHN_TEXT_MODERATION_FIXTURES_V1R"; readonly sha256: typeof BENCHMARK_SHA256; readonly count: 140; readonly rawContentIncluded: false } };
  readonly loaderContract: { readonly trainingRequires: readonly string[]; readonly validationRequires: readonly string[]; readonly failClosedStatuses: readonly string[]; readonly internalTestDevelopmentAccess: "DENIED" };
  readonly protections: { readonly candidateRowsMutated: false; readonly candidateTrainingEligibleFieldWritten: false; readonly historicalSplitMutated: false; readonly internalTestRawAccesses: 0; readonly benchmarkRawAccesses: 0; readonly developmentProjectionCreated: false; readonly developmentJsonlCreated: false; readonly trainingExecuted: false };
  readonly frozenAt: typeof MHS_COMBINED_FROZEN_AT;
}
export type MhsCombinedEligibilityArtifact = MhsCombinedEligibilityPayload & { readonly eligibilityPayloadDigest: string };

export interface MhsCombinedReleasePayload {
  readonly schemaVersion: typeof MHS_COMBINED_RELEASE_SCHEMA; readonly releaseVersion: typeof MHS_COMBINED_RELEASE_VERSION; readonly datasetVersion: typeof MHS_COMBINED_DATASET_VERSION; readonly phase: "T6L-8A0"; readonly status: "COMBINED_DATASET_RELEASE_AUTHORIZED"; readonly releaseAuthorization: "AUTHORIZE_MHS_DATASET_RELEASE_V2"; readonly releaseAuthorityId: string;
  readonly authorities: CombinedAuthorities & { readonly eligibilityManifestSha256: string; readonly eligibilityManifestPayloadDigest: string };
  readonly source: { readonly sourceId: "MEASURING_HATE_SPEECH"; readonly revision: "5468f6e118396646b02a2f691e771f6b6d9502ea"; readonly commercialTraining: "APPROVED"; readonly redistribution: "APPROVED" };
  readonly licenseObligations: { readonly licenseIdentifier: "LICENSE.CC_BY_4_0"; readonly licenseName: string; readonly licenseUrl: string; readonly attributionRequired: true; readonly attribution: string; readonly changeNoticeRequired: true; readonly changeNotice: string };
  readonly releaseContent: { readonly TRAIN: { readonly candidateCount: 200; readonly externalStatus: "TRAINING_ELIGIBLE"; readonly historicalCount: 60; readonly v2Count: 140; readonly decisionDistribution: { readonly ALLOW: 110; readonly BLOCK: 90 }; readonly blockCategoryDistribution: Readonly<Record<string, number>>; readonly sourceDistribution: { readonly MEASURING_HATE_SPEECH: 200 } }; readonly VALIDATION: { readonly candidateCount: 13; readonly externalStatus: "VALIDATION_AUTHORIZED"; readonly historicalCount: 13; readonly v2Count: 0; readonly decisionDistribution: { readonly ALLOW: 9; readonly BLOCK: 4 }; readonly sourceDistribution: { readonly MEASURING_HATE_SPEECH: 13 } }; readonly INTERNAL_TEST: { readonly candidateCount: 13; readonly externalStatus: "PROTECTED_INTERNAL_TEST"; readonly contentIncluded: false }; readonly V2_RESERVE: { readonly candidateCount: 256; readonly eligibility: "UNAUTHORIZED" }; readonly V2_EXCLUDED: { readonly candidateCount: 4; readonly eligibility: "UNAUTHORIZED" }; readonly EXTERNAL_BENCHMARK: { readonly fixtureCount: 140; readonly eligibility: "EVALUATION_ONLY"; readonly contentIncluded: false } };
  readonly membershipDigests: MhsCombinedEligibilityPayload["membershipDigests"];
  readonly qualityAuthority: { readonly provenanceValid: true; readonly licenseValid: true; readonly contaminationClear: true; readonly componentAtomicity: true; readonly membershipExact: true; readonly blockers: readonly [] };
  readonly materializationContract: { readonly candidateRowsRemainCanonical: true; readonly developmentProjectionCreated: false; readonly trainingFilesMaterialized: false; readonly releaseContentMaterialized: false; readonly futureMaterializationRequiresExactPairedAuthority: true };
  readonly protections: MhsCombinedEligibilityPayload["protections"]; readonly frozenAt: typeof MHS_COMBINED_FROZEN_AT;
}
export type MhsCombinedReleaseArtifact = MhsCombinedReleasePayload & { readonly releasePayloadDigest: string };

interface VerifiedInputs { readonly oldRelease: MhsReleaseManifestArtifact; readonly oldEligibility: MhsTrainingEligibilityManifestArtifact; readonly i5Projection: MhsV2ReleaseProjectionArtifact; readonly kdProjection: FinalCandidateProjectionArtifact; readonly kdAnalysis: FinalAssignmentAnalysisArtifact }
const verifyInputs = (input: MhsCombinedReleaseInputs): VerifiedInputs => {
  exact(input.oldReleaseBytes, MHS_RELEASE_MANIFEST_SHA256, "old release"); exact(input.oldEligibilityBytes, MHS_ELIGIBILITY_MANIFEST_SHA256, "old eligibility"); exact(input.oldEligibilityPlanBytes, MHS_R_ELIGIBILITY_PLAN_SHA256, "old eligibility plan");
  const oldRelease = parse<MhsReleaseManifestArtifact>(input.oldReleaseBytes), oldEligibility = parse<MhsTrainingEligibilityManifestArtifact>(input.oldEligibilityBytes); validateMhsTrainingEligibilityManifestArtifact(oldEligibility); validateMhsReleaseManifestArtifact(oldRelease, oldEligibility);
  if (parse<{ planningPayloadDigest: string }>(input.oldEligibilityPlanBytes).planningPayloadDigest !== MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST) throw new Error("T6L-8A0 old eligibility-plan payload mismatch");
  exact(input.historicalSplitBytes, MHS_SPLIT_MANIFEST_SHA256, "historical split"); validateMhsSplitManifestArtifact(parse<MhsSplitManifestArtifact>(input.historicalSplitBytes)); exact(input.internalTestFreezeBytes, MHS_INTERNAL_TEST_FREEZE_SHA256, "INTERNAL_TEST freeze"); validateMhsInternalTestFreezeArtifact(parse<MhsInternalTestFreezeArtifact>(input.internalTestFreezeBytes));
  exact(input.candidateBytes, MHS_V2_EXPANSION_CANDIDATE_SHA256, "V2 candidate"); exactPayloadDigest(input.candidateBytes, "candidatePayloadDigest", "V2 candidate");
  exact(input.universeBytes, MHS_V2_REVIEW_UNIVERSE_SHA256, "V2 universe"); exactPayloadDigest(input.universeBytes, "universePayloadDigest", "V2 universe");
  exact(input.consolidationBytes, MHS_V2_EXPANSION_CONSOLIDATION_SHA256, "V2 consolidation"); exactPayloadDigest(input.consolidationBytes, "certificationPayloadDigest", "V2 consolidation");
  exact(input.leakagePolicyBytes, MHS_V2_LEAKAGE_POLICY_SHA256, "leakage policy"); exactPayloadDigest(input.leakagePolicyBytes, "policyPayloadDigest", "leakage policy");
  exact(input.graphBytes, MHS_V2_LEAKAGE_GRAPH_SHA256, "graph"); exactPayloadDigest(input.graphBytes, "graphPayloadDigest", "graph");
  exact(input.componentsBytes, MHS_V2_LEAKAGE_COMPONENTS_SHA256, "components"); exactPayloadDigest(input.componentsBytes, "componentsPayloadDigest", "components");
  exact(input.cqCertificationBytes, MHS_V2_COLLISION_CERTIFICATION_SHA256, "CQ certification"); exactPayloadDigest(input.cqCertificationBytes, "certificationPayloadDigest", "CQ certification");
  exact(input.protectedCertificationBytes, PROTECTED_V2_CERTIFICATION_SHA256, "protected certification"); exactPayloadDigest(input.protectedCertificationBytes, "certificationPayloadDigest", "protected certification");
  exact(input.releasePolicyBytes, MHS_V2_RELEASE_POLICY_SHA256, "7I5 policy"); exact(input.releaseFeasibilityBytes, MHS_V2_RELEASE_FEASIBILITY_SHA256, "7I5 feasibility"); exact(input.releasePlanBytes, MHS_V2_RELEASE_PLAN_SHA256, "7I5 plan"); exact(input.releaseProjectionBytes, MHS_V2_RELEASE_PROJECTION_SHA256, "7I5 projection");
  const i5Policy = parse<MhsV2ReleasePolicyArtifact>(input.releasePolicyBytes), i5Feasibility = parse<MhsV2ReleaseFeasibilityArtifact>(input.releaseFeasibilityBytes), i5Plan = parse<MhsV2ReleasePlanArtifact>(input.releasePlanBytes), i5Projection = parse<MhsV2ReleaseProjectionArtifact>(input.releaseProjectionBytes); validateMhsV2TrainExpansionReleaseArtifacts(i5Policy, i5Feasibility, i5Plan, i5Projection);
  exact(input.componentAssignmentBytes, MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256, "7K-D component assignment"); exact(input.candidateAssignmentBytes, MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256, "7K-D candidate assignment"); exact(input.assignmentAnalysisBytes, MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256, "7K-D analysis"); exact(input.assignmentCertificationBytes, MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256, "7K-D certification");
  const kdComponent = parse<FinalComponentAssignmentArtifact>(input.componentAssignmentBytes), kdProjection = parse<FinalCandidateProjectionArtifact>(input.candidateAssignmentBytes), kdAnalysis = parse<FinalAssignmentAnalysisArtifact>(input.assignmentAnalysisBytes), kdCertification = parse<FinalAssignmentCertificationArtifact>(input.assignmentCertificationBytes); validateMhsV2FinalLeakageSafeAssignment(kdComponent, kdProjection, kdAnalysis, kdCertification);
  if (kdCertification.assignmentMembershipDigest !== K_D_ASSIGNMENT_DIGEST || i5Projection.releaseMembershipDigest !== I5_RELEASE_MEMBERSHIP_DIGEST || i5Feasibility.selectedComponentIdsDigest !== I5_SELECTED_COMPONENT_DIGEST) throw new Error("T6L-8A0 frozen V2 membership mismatch");
  return { oldRelease, oldEligibility, i5Projection, kdProjection, kdAnalysis };
};

const combinedAuthorities = (_input: MhsCombinedReleaseInputs): CombinedAuthorities => ({ oldReleaseSha256: MHS_RELEASE_MANIFEST_SHA256, oldReleasePayloadDigest: MHS_RELEASE_MANIFEST_PAYLOAD_DIGEST, oldEligibilitySha256: MHS_ELIGIBILITY_MANIFEST_SHA256, oldEligibilityPayloadDigest: MHS_ELIGIBILITY_MANIFEST_PAYLOAD_DIGEST, oldEligibilityPlanSha256: MHS_R_ELIGIBILITY_PLAN_SHA256, oldEligibilityPlanPayloadDigest: MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST, historicalSplitSha256: MHS_SPLIT_MANIFEST_SHA256, internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, v2CandidateSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, v2UniverseSha256: MHS_V2_REVIEW_UNIVERSE_SHA256, v2ConsolidationSha256: MHS_V2_EXPANSION_CONSOLIDATION_SHA256, leakagePolicySha256: MHS_V2_LEAKAGE_POLICY_SHA256, graphSha256: MHS_V2_LEAKAGE_GRAPH_SHA256, componentsSha256: MHS_V2_LEAKAGE_COMPONENTS_SHA256, cqCertificationSha256: MHS_V2_COLLISION_CERTIFICATION_SHA256, protectedCertificationSha256: PROTECTED_V2_CERTIFICATION_SHA256, i5PolicySha256: MHS_V2_RELEASE_POLICY_SHA256, i5FeasibilitySha256: MHS_V2_RELEASE_FEASIBILITY_SHA256, i5PlanSha256: MHS_V2_RELEASE_PLAN_SHA256, i5ProjectionSha256: MHS_V2_RELEASE_PROJECTION_SHA256, kdComponentAssignmentSha256: MHS_V2_FINAL_COMPONENT_ASSIGNMENT_SHA256, kdCandidateAssignmentSha256: MHS_V2_FINAL_CANDIDATE_PROJECTION_SHA256, kdAnalysisSha256: MHS_V2_FINAL_ASSIGNMENT_ANALYSIS_SHA256, kdCertificationSha256: MHS_V2_FINAL_ASSIGNMENT_CERTIFICATION_SHA256, kdAssignmentMembershipDigest: K_D_ASSIGNMENT_DIGEST, i5ReleaseMembershipDigest: I5_RELEASE_MEMBERSHIP_DIGEST, i5SelectedComponentDigest: I5_SELECTED_COMPONENT_DIGEST });

export const createMhsCombinedDatasetRelease = (input: MhsCombinedReleaseInputs): { readonly eligibility: MhsCombinedEligibilityArtifact; readonly release: MhsCombinedReleaseArtifact } => {
  const verified = verifyInputs(input); assertRegistries(); const source = requireTrainingSource("MEASURING_HATE_SPEECH"), license = licenseRegistry[source.sourceTextLicenseKey];
  if (source.revision !== "5468f6e118396646b02a2f691e771f6b6d9502ea" || source.sourceTextLicenseKey !== "LICENSE.CC_BY_4_0" || source.redistributionAssessment !== "APPROVED" || !license.authoritativeUrl) throw new Error("T6L-8A0 MHS provenance/license mismatch");
  const historicalEntries: MhsCombinedEligibilityEntry[] = verified.oldEligibility.entries.map((row) => ({ candidateId: row.candidateId, candidateTextDigest: row.candidateTextDigest, split: row.split, eligibility: row.eligibility as "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED", origin: "HISTORICAL_MHS_V1", sourceId: "MEASURING_HATE_SPEECH", sourceRevision: SOURCE_REVISION, evidenceDigest: digest(["HISTORICAL_MHS_V1", row.evidenceDigest, MHS_RELEASE_MANIFEST_SHA256, row.candidateId, row.candidateTextDigest, row.split]), releaseVersion: MHS_COMBINED_RELEASE_VERSION, datasetVersion: MHS_COMBINED_DATASET_VERSION }));
  const v2Entries: MhsCombinedEligibilityEntry[] = verified.kdProjection.rows.filter((row) => row.releaseDisposition === "RELEASED_TO_TRAIN").map((row) => ({ candidateId: row.candidateId, candidateTextDigest: row.textSha256, split: "TRAIN", eligibility: "TRAINING_ELIGIBLE", origin: "MHS_V2_EXPANSION", sourceId: "MEASURING_HATE_SPEECH", sourceRevision: SOURCE_REVISION, evidenceDigest: digest(["MHS_V2_EXPANSION", K_D_ASSIGNMENT_DIGEST, I5_RELEASE_MEMBERSHIP_DIGEST, row.candidateId, row.textSha256, row.componentId]), releaseVersion: MHS_COMBINED_RELEASE_VERSION, datasetVersion: MHS_COMBINED_DATASET_VERSION }));
  const entries = [...historicalEntries, ...v2Entries].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const v2Released = verified.kdAnalysis.dispositions.RELEASED_TO_TRAIN;
  const historicalTrain = verified.oldRelease.releaseContent.TRAIN;
  const combinedBlockCategories = Object.fromEntries(Object.keys(EXPECTED_COMBINED_BLOCK_CATEGORIES).map((category) => [category, (historicalTrain.categoryDistribution[category] ?? 0) + (v2Released.blockCategoryCounts[category] ?? 0)]));
  if (canonicalJson(historicalTrain.decisionDistribution) !== canonicalJson({ ALLOW: 40, BLOCK: 20 }) || canonicalJson(v2Released.decisionCounts) !== canonicalJson({ ALLOW: 70, BLOCK: 70 }) || canonicalJson(combinedBlockCategories) !== canonicalJson(EXPECTED_COMBINED_BLOCK_CATEGORIES) || canonicalJson(verified.oldRelease.releaseContent.VALIDATION.decisionDistribution) !== canonicalJson({ ALLOW: 9, BLOCK: 4 })) throw new Error("T6L-8A0 mechanically derived label/category accounting mismatch");
  const train = entries.filter((row) => row.split === "TRAIN"), validation = entries.filter((row) => row.split === "VALIDATION");
  const memberSurface = (rows: readonly MhsCombinedEligibilityEntry[]): readonly unknown[] => rows.map((row) => [row.candidateId, row.candidateTextDigest, row.split, row.eligibility, row.origin]);
  const membershipDigests = { train: digest(memberSurface(train)), validation: digest(memberSurface(validation)), development: digest(memberSurface(entries)), eligibility: digest(entries) };
  const authority = combinedAuthorities(input), releaseAuthorityId = `mhs_release_v2_${digest([MHS_COMBINED_DATASET_VERSION, MHS_COMBINED_RELEASE_VERSION, membershipDigests])}`;
  const eligibilityPayload: MhsCombinedEligibilityPayload = { schemaVersion: MHS_COMBINED_ELIGIBILITY_SCHEMA, manifestVersion: MHS_COMBINED_ELIGIBILITY_MANIFEST_VERSION, phase: "T6L-8A0", status: "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY", datasetVersion: MHS_COMBINED_DATASET_VERSION, releaseVersion: MHS_COMBINED_RELEASE_VERSION, releaseAuthorityId, authorities: authority, entries, membershipDigests, counts: { trainingEligible: 200, validationAuthorized: 13, historicalTrain: 60, v2Train: 140, v2Validation: 0, protectedInternalTest: 13, reserveUnauthorized: 256, excludedUnauthorized: 4, duplicateEntries: 0, unknownEntries: 0 }, sealedEvaluation: { internalTest: { count: 13, rawContentIncluded: false }, externalBenchmark: { version: "STHN_TEXT_MODERATION_FIXTURES_V1R", sha256: BENCHMARK_SHA256, count: 140, rawContentIncluded: false } }, loaderContract: { trainingRequires: ["exact candidate identity and text digest", "exact dataset and release version", "authoritative TRAIN membership", "TRAINING_ELIGIBLE status", "matching committed release authority"], validationRequires: ["exact candidate identity and text digest", "exact dataset and release version", "authoritative VALIDATION membership", "VALIDATION_AUTHORIZED status", "matching committed release authority"], failClosedStatuses: ["WRONG_SPLIT", "WRONG_STATUS", "UNKNOWN", "STALE", "MISSING_ELIGIBILITY", "WRONG_RELEASE", "AUTHORITY_MISMATCH", "RESERVE", "EXCLUDED", "INTERNAL_TEST"], internalTestDevelopmentAccess: "DENIED" }, protections: { candidateRowsMutated: false, candidateTrainingEligibleFieldWritten: false, historicalSplitMutated: false, internalTestRawAccesses: 0, benchmarkRawAccesses: 0, developmentProjectionCreated: false, developmentJsonlCreated: false, trainingExecuted: false }, frozenAt: MHS_COMBINED_FROZEN_AT };
  const eligibility: MhsCombinedEligibilityArtifact = { ...eligibilityPayload, eligibilityPayloadDigest: digest(eligibilityPayload) }, eligibilityBytes = Buffer.from(canonicalJson(eligibility), "utf8"), eligibilitySha = sha256(eligibilityBytes);
  const releasePayload: MhsCombinedReleasePayload = { schemaVersion: MHS_COMBINED_RELEASE_SCHEMA, releaseVersion: MHS_COMBINED_RELEASE_VERSION, datasetVersion: MHS_COMBINED_DATASET_VERSION, phase: "T6L-8A0", status: "COMBINED_DATASET_RELEASE_AUTHORIZED", releaseAuthorization: "AUTHORIZE_MHS_DATASET_RELEASE_V2", releaseAuthorityId, authorities: { ...authority, eligibilityManifestSha256: eligibilitySha, eligibilityManifestPayloadDigest: eligibility.eligibilityPayloadDigest }, source: { sourceId: "MEASURING_HATE_SPEECH", revision: SOURCE_REVISION, commercialTraining: "APPROVED", redistribution: "APPROVED" }, licenseObligations: { licenseIdentifier: "LICENSE.CC_BY_4_0", licenseName: license.name, licenseUrl: license.authoritativeUrl, attributionRequired: true, attribution: source.citation, changeNoticeRequired: true, changeNotice: "STHN selected, human-reviewed, policy-mapped, component-grouped, and release-authorized records from the pinned source revision; redistributed material must indicate these changes." }, releaseContent: { TRAIN: { candidateCount: 200, externalStatus: "TRAINING_ELIGIBLE", historicalCount: 60, v2Count: 140, decisionDistribution: { ALLOW: 110, BLOCK: 90 }, blockCategoryDistribution: combinedBlockCategories, sourceDistribution: { MEASURING_HATE_SPEECH: 200 } }, VALIDATION: { candidateCount: 13, externalStatus: "VALIDATION_AUTHORIZED", historicalCount: 13, v2Count: 0, decisionDistribution: { ALLOW: 9, BLOCK: 4 }, sourceDistribution: { MEASURING_HATE_SPEECH: 13 } }, INTERNAL_TEST: { candidateCount: 13, externalStatus: "PROTECTED_INTERNAL_TEST", contentIncluded: false }, V2_RESERVE: { candidateCount: 256, eligibility: "UNAUTHORIZED" }, V2_EXCLUDED: { candidateCount: 4, eligibility: "UNAUTHORIZED" }, EXTERNAL_BENCHMARK: { fixtureCount: 140, eligibility: "EVALUATION_ONLY", contentIncluded: false } }, membershipDigests, qualityAuthority: { provenanceValid: true, licenseValid: true, contaminationClear: true, componentAtomicity: true, membershipExact: true, blockers: [] }, materializationContract: { candidateRowsRemainCanonical: true, developmentProjectionCreated: false, trainingFilesMaterialized: false, releaseContentMaterialized: false, futureMaterializationRequiresExactPairedAuthority: true }, protections: eligibility.protections, frozenAt: MHS_COMBINED_FROZEN_AT };
  const release: MhsCombinedReleaseArtifact = { ...releasePayload, releasePayloadDigest: digest(releasePayload) };
  validateMhsCombinedDatasetRelease(release, eligibility); return { eligibility, release };
};

export const validateMhsCombinedEligibility = (artifact: MhsCombinedEligibilityArtifact): void => {
  const { eligibilityPayloadDigest, ...payload } = artifact;
  const train = payload.entries.filter((row) => row.split === "TRAIN");
  const validation = payload.entries.filter((row) => row.split === "VALIDATION");
  const historical = payload.entries.filter((row) => row.origin === "HISTORICAL_MHS_V1");
  const v2 = payload.entries.filter((row) => row.origin === "MHS_V2_EXPANSION");
  const ids = payload.entries.map((row) => row.candidateId);
  const memberSurface = (rows: readonly MhsCombinedEligibilityEntry[]): readonly unknown[] => rows.map((row) => [row.candidateId, row.candidateTextDigest, row.split, row.eligibility, row.origin]);
  const expectedDigests = { train: digest(memberSurface(train)), validation: digest(memberSurface(validation)), development: digest(memberSurface(payload.entries)), eligibility: digest(payload.entries) };
  const invalidEntry = payload.entries.some((row) => !row.candidateId || !/^[a-f0-9]{64}$/u.test(row.candidateTextDigest) || !/^[a-f0-9]{64}$/u.test(row.evidenceDigest)
    || row.sourceId !== "MEASURING_HATE_SPEECH" || row.sourceRevision !== SOURCE_REVISION || row.datasetVersion !== MHS_COMBINED_DATASET_VERSION || row.releaseVersion !== MHS_COMBINED_RELEASE_VERSION
    || (row.origin === "MHS_V2_EXPANSION" && (row.split !== "TRAIN" || row.eligibility !== "TRAINING_ELIGIBLE")));
  if (eligibilityPayloadDigest !== digest(payload) || !pinMatches(sha256(Buffer.from(canonicalJson(artifact), "utf8")), MHS_COMBINED_ELIGIBILITY_SHA256) || !pinMatches(eligibilityPayloadDigest, MHS_COMBINED_ELIGIBILITY_PAYLOAD_DIGEST)
    || payload.schemaVersion !== MHS_COMBINED_ELIGIBILITY_SCHEMA || payload.manifestVersion !== MHS_COMBINED_ELIGIBILITY_MANIFEST_VERSION || payload.phase !== "T6L-8A0" || payload.status !== "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY"
    || payload.datasetVersion !== MHS_COMBINED_DATASET_VERSION || payload.releaseVersion !== MHS_COMBINED_RELEASE_VERSION || !payload.releaseAuthorityId
    || payload.entries.length !== 213 || new Set(ids).size !== 213 || canonicalJson(ids) !== canonicalJson([...ids].sort()) || invalidEntry
    || train.length !== 200 || validation.length !== 13 || historical.length !== 73 || v2.length !== 140 || train.filter((row) => row.origin === "HISTORICAL_MHS_V1").length !== 60 || validation.some((row) => row.origin !== "HISTORICAL_MHS_V1")
    || train.some((row) => row.eligibility !== "TRAINING_ELIGIBLE") || validation.some((row) => row.eligibility !== "VALIDATION_AUTHORIZED") || canonicalJson(payload.membershipDigests) !== canonicalJson(expectedDigests)
    || canonicalJson(payload.counts) !== canonicalJson({ trainingEligible: 200, validationAuthorized: 13, historicalTrain: 60, v2Train: 140, v2Validation: 0, protectedInternalTest: 13, reserveUnauthorized: 256, excludedUnauthorized: 4, duplicateEntries: 0, unknownEntries: 0 })
    || payload.sealedEvaluation.internalTest.count !== 13 || payload.sealedEvaluation.internalTest.rawContentIncluded || payload.sealedEvaluation.externalBenchmark.version !== "STHN_TEXT_MODERATION_FIXTURES_V1R" || payload.sealedEvaluation.externalBenchmark.sha256 !== BENCHMARK_SHA256 || payload.sealedEvaluation.externalBenchmark.count !== 140 || payload.sealedEvaluation.externalBenchmark.rawContentIncluded
    || payload.loaderContract.internalTestDevelopmentAccess !== "DENIED" || payload.protections.candidateRowsMutated || payload.protections.candidateTrainingEligibleFieldWritten || payload.protections.historicalSplitMutated || payload.protections.developmentProjectionCreated || payload.protections.developmentJsonlCreated || payload.protections.internalTestRawAccesses || payload.protections.benchmarkRawAccesses || payload.protections.trainingExecuted) throw new Error("Invalid T6L-8A0 eligibility authority");
};

export const validateMhsCombinedDatasetRelease = (release: MhsCombinedReleaseArtifact, eligibility: MhsCombinedEligibilityArtifact): void => {
  validateMhsCombinedEligibility(eligibility);
  const { releasePayloadDigest, ...payload } = release;
  if (releasePayloadDigest !== digest(payload) || !pinMatches(sha256(Buffer.from(canonicalJson(release), "utf8")), MHS_COMBINED_RELEASE_SHA256) || !pinMatches(releasePayloadDigest, MHS_COMBINED_RELEASE_PAYLOAD_DIGEST)
    || payload.schemaVersion !== MHS_COMBINED_RELEASE_SCHEMA || payload.phase !== "T6L-8A0" || payload.status !== "COMBINED_DATASET_RELEASE_AUTHORIZED" || payload.releaseAuthorization !== "AUTHORIZE_MHS_DATASET_RELEASE_V2"
    || payload.datasetVersion !== MHS_COMBINED_DATASET_VERSION || payload.releaseVersion !== MHS_COMBINED_RELEASE_VERSION || payload.releaseAuthorityId !== eligibility.releaseAuthorityId
    || payload.authorities.eligibilityManifestSha256 !== sha256(Buffer.from(canonicalJson(eligibility), "utf8")) || payload.authorities.eligibilityManifestPayloadDigest !== eligibility.eligibilityPayloadDigest || canonicalJson(payload.membershipDigests) !== canonicalJson(eligibility.membershipDigests)
    || payload.source.sourceId !== "MEASURING_HATE_SPEECH" || payload.source.revision !== SOURCE_REVISION || payload.source.commercialTraining !== "APPROVED" || payload.source.redistribution !== "APPROVED"
    || payload.licenseObligations.licenseIdentifier !== "LICENSE.CC_BY_4_0" || payload.licenseObligations.licenseUrl !== "https://creativecommons.org/licenses/by/4.0/legalcode" || !payload.licenseObligations.attributionRequired || !payload.licenseObligations.attribution || !payload.licenseObligations.changeNoticeRequired || !payload.licenseObligations.changeNotice
    || payload.releaseContent.TRAIN.candidateCount !== 200 || payload.releaseContent.TRAIN.historicalCount !== 60 || payload.releaseContent.TRAIN.v2Count !== 140 || canonicalJson(payload.releaseContent.TRAIN.decisionDistribution) !== canonicalJson({ ALLOW: 110, BLOCK: 90 }) || canonicalJson(payload.releaseContent.TRAIN.blockCategoryDistribution) !== canonicalJson(EXPECTED_COMBINED_BLOCK_CATEGORIES)
    || payload.releaseContent.VALIDATION.candidateCount !== 13 || payload.releaseContent.VALIDATION.historicalCount !== 13 || payload.releaseContent.VALIDATION.v2Count !== 0 || canonicalJson(payload.releaseContent.VALIDATION.decisionDistribution) !== canonicalJson({ ALLOW: 9, BLOCK: 4 })
    || payload.releaseContent.INTERNAL_TEST.candidateCount !== 13 || payload.releaseContent.INTERNAL_TEST.contentIncluded || payload.releaseContent.V2_RESERVE.candidateCount !== 256 || payload.releaseContent.V2_RESERVE.eligibility !== "UNAUTHORIZED" || payload.releaseContent.V2_EXCLUDED.candidateCount !== 4 || payload.releaseContent.V2_EXCLUDED.eligibility !== "UNAUTHORIZED" || payload.releaseContent.EXTERNAL_BENCHMARK.fixtureCount !== 140 || payload.releaseContent.EXTERNAL_BENCHMARK.eligibility !== "EVALUATION_ONLY" || payload.releaseContent.EXTERNAL_BENCHMARK.contentIncluded
    || !payload.qualityAuthority.provenanceValid || !payload.qualityAuthority.licenseValid || !payload.qualityAuthority.contaminationClear || !payload.qualityAuthority.componentAtomicity || !payload.qualityAuthority.membershipExact || payload.qualityAuthority.blockers.length
    || !payload.materializationContract.candidateRowsRemainCanonical || payload.materializationContract.developmentProjectionCreated || payload.materializationContract.trainingFilesMaterialized || payload.materializationContract.releaseContentMaterialized || !payload.materializationContract.futureMaterializationRequiresExactPairedAuthority
    || canonicalJson(payload.protections) !== canonicalJson(eligibility.protections)) throw new Error("Invalid T6L-8A0 release authority");
};

export type MhsCombinedAccessPurpose = "TRAINING" | "VALIDATION";
export type MhsCombinedAccessDecision = { readonly allowed: true; readonly status: "AUTHORIZED_TRAINING" | "AUTHORIZED_VALIDATION" } | { readonly allowed: false; readonly status: "DENIED_UNKNOWN_CANDIDATE" | "DENIED_WRONG_SPLIT" | "DENIED_STALE_CANDIDATE" | "DENIED_STALE_RELEASE" | "DENIED_MISSING_ELIGIBILITY" | "DENIED_AUTHORITY_MISMATCH" };
export const authorizeMhsCombinedReleasedCandidateAccess = (request: { readonly candidateId: string; readonly candidateTextDigest: string; readonly purpose: MhsCombinedAccessPurpose; readonly releaseVersion: string; readonly datasetVersion: string }, release: MhsCombinedReleaseArtifact, eligibility: MhsCombinedEligibilityArtifact): MhsCombinedAccessDecision => { try { validateMhsCombinedDatasetRelease(release, eligibility); } catch { return { allowed: false, status: "DENIED_AUTHORITY_MISMATCH" }; } if (request.releaseVersion !== MHS_COMBINED_RELEASE_VERSION || request.datasetVersion !== MHS_COMBINED_DATASET_VERSION) return { allowed: false, status: "DENIED_STALE_RELEASE" }; const entry = eligibility.entries.find((row) => row.candidateId === request.candidateId); if (!entry) return { allowed: false, status: "DENIED_UNKNOWN_CANDIDATE" }; if (entry.candidateTextDigest !== request.candidateTextDigest) return { allowed: false, status: "DENIED_STALE_CANDIDATE" }; if (!entry.eligibility) return { allowed: false, status: "DENIED_MISSING_ELIGIBILITY" }; if (request.purpose === "TRAINING" && entry.split === "TRAIN" && entry.eligibility === "TRAINING_ELIGIBLE") return { allowed: true, status: "AUTHORIZED_TRAINING" }; if (request.purpose === "VALIDATION" && entry.split === "VALIDATION" && entry.eligibility === "VALIDATION_AUTHORIZED") return { allowed: true, status: "AUTHORIZED_VALIDATION" }; return { allowed: false, status: "DENIED_WRONG_SPLIT" }; };

type PairPublisher = (eligibilityTemporary: string, eligibilityTarget: string, releaseTemporary: string, releaseTarget: string) => void;
const defaultPublisher: PairPublisher = (eligibilityTemporary, eligibilityTarget, releaseTemporary, releaseTarget): void => { fs.renameSync(eligibilityTemporary, eligibilityTarget); fs.renameSync(releaseTemporary, releaseTarget); };
export const publishMhsCombinedDatasetRelease = (artifacts: ReturnType<typeof createMhsCombinedDatasetRelease>, outputDirectory: string, publisher: PairPublisher = defaultPublisher): { readonly releasePath: string; readonly releaseSha256: string; readonly eligibilityPath: string; readonly eligibilitySha256: string } => { validateMhsCombinedDatasetRelease(artifacts.release, artifacts.eligibility); fs.mkdirSync(outputDirectory, { recursive: true }); const eligibilityPath = path.join(outputDirectory, MHS_COMBINED_ELIGIBILITY_FILENAME), releasePath = path.join(outputDirectory, MHS_COMBINED_RELEASE_FILENAME); if (fs.existsSync(eligibilityPath) || fs.existsSync(releasePath)) throw new Error("T6L-8A0 overwrite refused"); const token = `${process.pid}`, et = `${eligibilityPath}.${token}.tmp`, rt = `${releasePath}.${token}.tmp`; try { fs.writeFileSync(et, canonicalJson(artifacts.eligibility), { flag: "wx" }); fs.writeFileSync(rt, canonicalJson(artifacts.release), { flag: "wx" }); publisher(et, eligibilityPath, rt, releasePath); if (!fs.existsSync(eligibilityPath) || !fs.existsSync(releasePath)) throw new Error("T6L-8A0 incomplete paired publication"); } catch (error) { [et, rt, eligibilityPath, releasePath].forEach((filename) => { if (fs.existsSync(filename)) fs.rmSync(filename); }); throw error; } return { releasePath, releaseSha256: sha256(fs.readFileSync(releasePath)), eligibilityPath, eligibilitySha256: sha256(fs.readFileSync(eligibilityPath)) }; };
