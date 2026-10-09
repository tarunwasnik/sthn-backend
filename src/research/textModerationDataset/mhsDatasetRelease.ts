import fs from "node:fs";
import path from "node:path";

import { ACQUISITION_MANIFEST_VERSION, AcquisitionManifest, DATASET_POLICY_VERSION, LICENSE_REGISTRY_VERSION, SOURCE_REGISTRY_VERSION } from "./contracts";
import { canonicalJson, sha256 } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_PAYLOAD_DIGEST, MhsCandidateIntegrityAuditArtifact, validateMhsCandidateIntegrityAuditArtifact } from "./mhsCandidateIntegrityAudit";
import { MHS_CANDIDATE_INTEGRITY_SHA256 } from "./mhsReviewedSemanticApplicationContract";
import { MHS_CANDIDATE_MEMBERSHIP_DIGEST, MhsSemanticGroupingOverlayArtifact, validateMhsSemanticGroupingOverlayArtifact } from "./mhsSemanticGroupingOverlay";
import { MHS_SPLIT_MANIFEST_ID, MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST, MHS_SPLIT_MANIFEST_SHA256, MhsInternalTestFreezeArtifact, validateMhsInternalTestFreezeArtifact } from "./mhsInternalTestFreeze";
import { MHS_GROUPING_UNION_SPLIT_PLAN_PAYLOAD_DIGEST, MHS_GROUPING_UNION_SPLIT_PLAN_SHA256, MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";
import { MHS_SEMANTIC_GROUPING_OVERLAY_SHA256, MhsGroupingUnionSplitPlanArtifact, validateMhsGroupingUnionSplitPlanArtifact } from "./mhsGroupingUnionSplitPlan";
import { MhsProtectedContaminationAuditArtifact, validateMhsProtectedContaminationAuditArtifact } from "./mhsProtectedContaminationAudit";
import {
  MHS_CONTAMINATION_ARTIFACT_SHA256,
  MHS_CONTAMINATION_PAYLOAD_DIGEST,
  MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST,
  MHS_INTERNAL_TEST_FREEZE_SHA256,
  MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST,
  MHS_TRAINING_ELIGIBILITY_GATE_VERSION,
  MHS_TRAINING_ELIGIBILITY_RELEASE_PLAN_SCHEMA,
  MHS_TRAINING_ELIGIBILITY_RELEASE_PLAN_VERSION,
  MHS_VALIDATION_READINESS_GATE_VERSION,
  TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256,
  MhsTrainingEligibilityReleasePlanArtifact,
  validateMhsTrainingEligibilityReleasePlanArtifact,
} from "./mhsTrainingEligibilityReleasePlan";
import { assertRegistries, licenseRegistry, sourceRegistry } from "./registries";

export const MHS_RELEASE_MANIFEST_SCHEMA = "STHN_TEXT_MODERATION_MHS_RELEASE_MANIFEST_V1" as const;
export const MHS_RELEASE_VERSION = "MHS_DATASET_RELEASE_V1" as const;
export const MHS_DATASET_VERSION = "STHN_TEXT_MODERATION_DATASET_MHS_V1" as const;
export const MHS_RELEASE_MANIFEST_FILENAME = "mhs-release-manifest-v1.json" as const;
export const MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA = "STHN_TEXT_MODERATION_MHS_TRAINING_ELIGIBILITY_MANIFEST_V1" as const;
export const MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION = "MHS_TRAINING_ELIGIBILITY_MANIFEST_V1" as const;
export const MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME = "mhs-training-eligibility-manifest-v1.json" as const;
export const MHS_R_ELIGIBILITY_PLAN_SHA256 = "7e8dfe0da98201e2a80e5c4d01b35a3d21ff48096d46420a33b248aea9b3fb19" as const;
export const MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST = "92c901ecf93c9f45a956ab94e2502b2a353b49c0f7dfc0f613820658c67cb985" as const;

export type MhsDatasetReleaseAuthorizationDecision = "AUTHORIZE_MHS_DATASET_RELEASE_V1" | "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1";
export type MhsExternalEligibilityStatus = "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED" | "PROTECTED_INTERNAL_TEST" | "BLOCKED";
export type MhsReleasedAccessPurpose = "TRAINING" | "VALIDATION";
export type MhsReleasedAccessDecision =
  | { readonly allowed: true; readonly status: "AUTHORIZED_TRAINING" | "AUTHORIZED_VALIDATION" }
  | { readonly allowed: false; readonly status: "DENIED_UNKNOWN_CANDIDATE" | "DENIED_PROTECTED_INTERNAL_TEST" | "DENIED_WRONG_SPLIT" | "DENIED_STALE_CANDIDATE" | "DENIED_STALE_RELEASE" | "DENIED_MISSING_ELIGIBILITY" | "DENIED_BLOCKED_ELIGIBILITY" | "DENIED_AUTHORITY_MISMATCH" };

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const strictInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const tally = (values: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const exactBytes = (filename: string, expected: string): Buffer => { const bytes = fs.readFileSync(filename); if (sha256(bytes) !== expected) throw new Error(`S authority SHA-256 mismatch: ${path.basename(filename)}`); return bytes; };
const readExact = <T>(filename: string, expected: string, validate: (value: T) => void): T => { const value = JSON.parse(exactBytes(filename, expected).toString("utf8")) as T; validate(value); return value; };

export interface MhsReleaseAuthorizationEvidence {
  readonly trainAuthoritative: number;
  readonly trainQualifying: number;
  readonly trainBlocked: number;
  readonly validationAuthoritative: number;
  readonly validationReady: number;
  readonly validationBlocked: number;
  readonly protectedInternalTest: number;
  readonly internalTestProtectionIntact: boolean;
  readonly provenanceLicenseValid: boolean;
  readonly contaminationClear: boolean;
  readonly groupingIntegrityIntact: boolean;
  readonly candidateMembershipUnchanged: boolean;
  readonly unresolvedAnnotationPiiLineageCount: number;
  readonly immutablePairedPublicationAvailable: boolean;
}

export const decideMhsDatasetReleaseAuthorization = (evidence: MhsReleaseAuthorizationEvidence): MhsDatasetReleaseAuthorizationDecision =>
  evidence.trainAuthoritative === 60 && evidence.trainQualifying === 60 && evidence.trainBlocked === 0
    && evidence.validationAuthoritative === 13 && evidence.validationReady === 13 && evidence.validationBlocked === 0
    && evidence.protectedInternalTest === 13 && evidence.internalTestProtectionIntact
    && evidence.provenanceLicenseValid && evidence.contaminationClear && evidence.groupingIntegrityIntact
    && evidence.candidateMembershipUnchanged && evidence.unresolvedAnnotationPiiLineageCount === 0
    && evidence.immutablePairedPublicationAvailable
    ? "AUTHORIZE_MHS_DATASET_RELEASE_V1"
    : "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1";

export interface MhsEligibilityManifestEntry {
  readonly candidateId: string;
  readonly candidateTextDigest: string;
  readonly split: "TRAIN" | "VALIDATION";
  readonly eligibility: "TRAINING_ELIGIBLE" | "VALIDATION_AUTHORIZED" | "BLOCKED";
  readonly evidenceDigest: string;
  readonly releaseVersion: typeof MHS_RELEASE_VERSION;
  readonly datasetVersion: typeof MHS_DATASET_VERSION;
}

export interface MhsTrainingEligibilityManifestPayload {
  readonly schemaVersion: typeof MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA;
  readonly manifestVersion: typeof MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION;
  readonly phase: "T6L-6J-S";
  readonly status: "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY";
  readonly releaseVersion: typeof MHS_RELEASE_VERSION;
  readonly datasetVersion: typeof MHS_DATASET_VERSION;
  readonly releaseAuthorityId: string;
  readonly authorities: {
    readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256;
    readonly candidateMembershipDigest: typeof MHS_CANDIDATE_MEMBERSHIP_DIGEST;
    readonly splitManifestSha256: typeof MHS_SPLIT_MANIFEST_SHA256;
    readonly splitManifestPayloadDigest: typeof MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST;
    readonly internalTestFreezeSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256;
    readonly internalTestFreezePayloadDigest: typeof MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST;
    readonly rEligibilityPlanSha256: typeof MHS_R_ELIGIBILITY_PLAN_SHA256;
    readonly rEligibilityPlanPayloadDigest: typeof MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST;
  };
  readonly entries: readonly MhsEligibilityManifestEntry[];
  readonly protectedInternalTest: { readonly status: "PROTECTED_INTERNAL_TEST"; readonly eligibility: "NOT_TRAINING_ELIGIBLE"; readonly candidateCount: 13; readonly membershipDigest: typeof MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST; readonly contentIncluded: false };
  readonly counts: { readonly trainingEligible: 60; readonly validationAuthorized: 13; readonly protectedInternalTest: 13; readonly blocked: 0; readonly candidateRowMutationCount: 0 };
  readonly loaderContract: { readonly trainingRequires: readonly string[]; readonly validationRequires: readonly string[]; readonly failClosedStatuses: readonly string[]; readonly internalTestDevelopmentAccess: "DENIED" };
  readonly protections: { readonly candidateRowsMutated: false; readonly candidateTrainingEligibleFieldWritten: false; readonly splitMembershipMutated: false; readonly internalTestContentAccessed: false; readonly frozen140Accessed: false; readonly trainingMaterialized: false; readonly trainingExecuted: false; readonly evaluationExecuted: false };
  readonly createdAt: string;
}
export interface MhsTrainingEligibilityManifestArtifact extends MhsTrainingEligibilityManifestPayload { readonly eligibilityPayloadDigest: string }

export interface MhsReleaseManifestPayload {
  readonly schemaVersion: typeof MHS_RELEASE_MANIFEST_SCHEMA;
  readonly releaseVersion: typeof MHS_RELEASE_VERSION;
  readonly datasetVersion: typeof MHS_DATASET_VERSION;
  readonly policyVersion: typeof DATASET_POLICY_VERSION;
  readonly phase: "T6L-6J-S";
  readonly status: "IMMUTABLE_AUTHORIZED_DATASET_RELEASE";
  readonly releaseAuthorization: "AUTHORIZE_MHS_DATASET_RELEASE_V1";
  readonly releaseAuthorityId: string;
  readonly authorities: {
    readonly candidateArtifactSha256: typeof MHS_CANDIDATE_ARTIFACT_SHA256;
    readonly candidatePayloadDigest: typeof MHS_CANDIDATE_PAYLOAD_DIGEST;
    readonly candidateMembershipDigest: typeof MHS_CANDIDATE_MEMBERSHIP_DIGEST;
    readonly candidateIntegrityArtifactSha256: typeof MHS_CANDIDATE_INTEGRITY_SHA256;
    readonly splitManifestSha256: typeof MHS_SPLIT_MANIFEST_SHA256;
    readonly splitManifestPayloadDigest: typeof MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST;
    readonly internalTestFreezeSha256: typeof MHS_INTERNAL_TEST_FREEZE_SHA256;
    readonly internalTestFreezePayloadDigest: typeof MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST;
    readonly rEligibilityPlanSha256: typeof MHS_R_ELIGIBILITY_PLAN_SHA256;
    readonly rEligibilityPlanPayloadDigest: typeof MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST;
    readonly semanticGroupingOverlaySha256: typeof MHS_SEMANTIC_GROUPING_OVERLAY_SHA256;
    readonly groupingUnionPlanSha256: typeof MHS_GROUPING_UNION_SPLIT_PLAN_SHA256;
    readonly groupingUnionPlanPayloadDigest: typeof MHS_GROUPING_UNION_SPLIT_PLAN_PAYLOAD_DIGEST;
    readonly contaminationArtifactSha256: typeof MHS_CONTAMINATION_ARTIFACT_SHA256;
    readonly contaminationPayloadDigest: typeof MHS_CONTAMINATION_PAYLOAD_DIGEST;
    readonly acquisitionManifestSha256: typeof TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256;
    readonly sourceRegistryVersion: typeof SOURCE_REGISTRY_VERSION;
    readonly licenseRegistryVersion: typeof LICENSE_REGISTRY_VERSION;
    readonly eligibilityManifestSha256: string;
    readonly eligibilityManifestPayloadDigest: string;
  };
  readonly source: { readonly sourceId: "MEASURING_HATE_SPEECH"; readonly revision: string; readonly acquiredArtifactSha256: string };
  readonly licenseObligations: { readonly licenseIdentifier: "LICENSE.CC_BY_4_0"; readonly licenseName: string; readonly licenseUrl: string; readonly attributionRequired: true; readonly attribution: string; readonly changeNoticeRequired: true; readonly changeNotice: string };
  readonly releaseContent: {
    readonly TRAIN: { readonly candidateCount: 60; readonly externalStatus: "TRAINING_ELIGIBLE"; readonly decisionDistribution: Readonly<Record<string, number>>; readonly categoryDistribution: Readonly<Record<string, number>>; readonly languageDistribution: Readonly<Record<string, number>>; readonly scriptDistribution: Readonly<Record<string, number>>; readonly piiSummary: Readonly<Record<string, number>> };
    readonly VALIDATION: { readonly candidateCount: 13; readonly externalStatus: "VALIDATION_AUTHORIZED"; readonly decisionDistribution: Readonly<Record<string, number>>; readonly categoryDistribution: Readonly<Record<string, number>>; readonly languageDistribution: Readonly<Record<string, number>>; readonly scriptDistribution: Readonly<Record<string, number>>; readonly piiSummary: Readonly<Record<string, number>> };
    readonly INTERNAL_TEST: { readonly candidateCount: 13; readonly componentCount: 11; readonly externalStatus: "PROTECTED_INTERNAL_TEST"; readonly trainingEligibleCount: 0; readonly protectedMembershipDigest: typeof MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST; readonly contentIncluded: false };
  };
  readonly qualityAuthority: { readonly annotationResolved: true; readonly piiClear: true; readonly provenanceValid: true; readonly contaminationStatus: "NO_DETECTED_OVERLAP"; readonly groupingIntegrityIntact: true; readonly lineageIntegrityIntact: true; readonly dataQualityValid: true; readonly blockers: readonly [] };
  readonly materializationContract: { readonly candidateRowsRemainCanonical: true; readonly datasetVersionInjectedOnlyDuringFutureMaterialization: true; readonly trainingFilesMaterialized: false; readonly releaseContentMaterialized: false };
  readonly protections: { readonly candidateRowsMutated: false; readonly splitManifestMutated: false; readonly internalTestFreezeMutated: false; readonly candidateTrainingEligibleFieldWritten: false; readonly internalTestContentAccessed: false; readonly frozen140Accessed: false; readonly trainingExecuted: false; readonly evaluationExecuted: false };
  readonly createdAt: string;
}
export interface MhsReleaseManifestArtifact extends MhsReleaseManifestPayload { readonly releasePayloadDigest: string }

export const validateMhsTrainingEligibilityManifestArtifact = (artifact: MhsTrainingEligibilityManifestArtifact): void => {
  const { eligibilityPayloadDigest, ...payload } = artifact;
  const train = payload.entries.filter((row) => row.split === "TRAIN");
  const validation = payload.entries.filter((row) => row.split === "VALIDATION");
  if (payload.schemaVersion !== MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA || payload.manifestVersion !== MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION || payload.phase !== "T6L-6J-S" || payload.status !== "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY"
    || payload.releaseVersion !== MHS_RELEASE_VERSION || payload.datasetVersion !== MHS_DATASET_VERSION || !payload.releaseAuthorityId
    || payload.authorities.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.authorities.candidateMembershipDigest !== MHS_CANDIDATE_MEMBERSHIP_DIGEST || payload.authorities.splitManifestSha256 !== MHS_SPLIT_MANIFEST_SHA256 || payload.authorities.splitManifestPayloadDigest !== MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST || payload.authorities.internalTestFreezeSha256 !== MHS_INTERNAL_TEST_FREEZE_SHA256 || payload.authorities.internalTestFreezePayloadDigest !== MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST || payload.authorities.rEligibilityPlanSha256 !== MHS_R_ELIGIBILITY_PLAN_SHA256 || payload.authorities.rEligibilityPlanPayloadDigest !== MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST
    || payload.entries.length !== 73 || new Set(payload.entries.map((row) => row.candidateId)).size !== 73 || train.length !== 60 || validation.length !== 13
    || train.some((row) => row.eligibility !== "TRAINING_ELIGIBLE") || validation.some((row) => row.eligibility !== "VALIDATION_AUTHORIZED")
    || payload.entries.some((row) => row.releaseVersion !== MHS_RELEASE_VERSION || row.datasetVersion !== MHS_DATASET_VERSION || !/^[a-f0-9]{64}$/.test(row.candidateTextDigest) || !/^[a-f0-9]{64}$/.test(row.evidenceDigest))
    || payload.protectedInternalTest.status !== "PROTECTED_INTERNAL_TEST" || payload.protectedInternalTest.eligibility !== "NOT_TRAINING_ELIGIBLE" || payload.protectedInternalTest.candidateCount !== 13 || payload.protectedInternalTest.membershipDigest !== MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST || payload.protectedInternalTest.contentIncluded
    || payload.counts.trainingEligible !== 60 || payload.counts.validationAuthorized !== 13 || payload.counts.protectedInternalTest !== 13 || payload.counts.blocked !== 0 || payload.counts.candidateRowMutationCount !== 0
    || payload.loaderContract.internalTestDevelopmentAccess !== "DENIED" || payload.protections.candidateRowsMutated || payload.protections.candidateTrainingEligibleFieldWritten || payload.protections.splitMembershipMutated || payload.protections.internalTestContentAccessed || payload.protections.frozen140Accessed || payload.protections.trainingMaterialized || payload.protections.trainingExecuted || payload.protections.evaluationExecuted
    || !strictInstant(payload.createdAt) || eligibilityPayloadDigest !== digest(payload)) throw new Error("Invalid MHS training-eligibility manifest");
};

export const validateMhsReleaseManifestArtifact = (artifact: MhsReleaseManifestArtifact, eligibility?: MhsTrainingEligibilityManifestArtifact): void => {
  const { releasePayloadDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_RELEASE_MANIFEST_SCHEMA || payload.releaseVersion !== MHS_RELEASE_VERSION || payload.datasetVersion !== MHS_DATASET_VERSION || payload.policyVersion !== DATASET_POLICY_VERSION || payload.phase !== "T6L-6J-S" || payload.status !== "IMMUTABLE_AUTHORIZED_DATASET_RELEASE" || payload.releaseAuthorization !== "AUTHORIZE_MHS_DATASET_RELEASE_V1"
    || payload.authorities.candidateArtifactSha256 !== MHS_CANDIDATE_ARTIFACT_SHA256 || payload.authorities.candidatePayloadDigest !== MHS_CANDIDATE_PAYLOAD_DIGEST || payload.authorities.candidateMembershipDigest !== MHS_CANDIDATE_MEMBERSHIP_DIGEST || payload.authorities.candidateIntegrityArtifactSha256 !== MHS_CANDIDATE_INTEGRITY_SHA256 || payload.authorities.splitManifestSha256 !== MHS_SPLIT_MANIFEST_SHA256 || payload.authorities.splitManifestPayloadDigest !== MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST || payload.authorities.internalTestFreezeSha256 !== MHS_INTERNAL_TEST_FREEZE_SHA256 || payload.authorities.internalTestFreezePayloadDigest !== MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST || payload.authorities.rEligibilityPlanSha256 !== MHS_R_ELIGIBILITY_PLAN_SHA256 || payload.authorities.rEligibilityPlanPayloadDigest !== MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST || payload.authorities.semanticGroupingOverlaySha256 !== MHS_SEMANTIC_GROUPING_OVERLAY_SHA256 || payload.authorities.groupingUnionPlanSha256 !== MHS_GROUPING_UNION_SPLIT_PLAN_SHA256 || payload.authorities.groupingUnionPlanPayloadDigest !== MHS_GROUPING_UNION_SPLIT_PLAN_PAYLOAD_DIGEST || payload.authorities.contaminationArtifactSha256 !== MHS_CONTAMINATION_ARTIFACT_SHA256 || payload.authorities.contaminationPayloadDigest !== MHS_CONTAMINATION_PAYLOAD_DIGEST || payload.authorities.acquisitionManifestSha256 !== TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 || payload.authorities.sourceRegistryVersion !== SOURCE_REGISTRY_VERSION || payload.authorities.licenseRegistryVersion !== LICENSE_REGISTRY_VERSION
    || payload.releaseContent.TRAIN.candidateCount !== 60 || payload.releaseContent.TRAIN.externalStatus !== "TRAINING_ELIGIBLE" || canonicalJson(payload.releaseContent.TRAIN.decisionDistribution) !== canonicalJson({ ALLOW: 40, BLOCK: 20 }) || canonicalJson(payload.releaseContent.TRAIN.categoryDistribution) !== canonicalJson({ ABUSIVE_OR_HARASSING: 6, ALLOW_NONE: 40, HATE: 4, PROFANITY: 3, SEXUAL: 7 }) || canonicalJson(payload.releaseContent.TRAIN.languageDistribution) !== canonicalJson({ en: 60 }) || canonicalJson(payload.releaseContent.TRAIN.scriptDistribution) !== canonicalJson({ LATIN: 60 })
    || payload.releaseContent.VALIDATION.candidateCount !== 13 || payload.releaseContent.VALIDATION.externalStatus !== "VALIDATION_AUTHORIZED" || canonicalJson(payload.releaseContent.VALIDATION.decisionDistribution) !== canonicalJson({ ALLOW: 9, BLOCK: 4 }) || canonicalJson(payload.releaseContent.VALIDATION.categoryDistribution) !== canonicalJson({ ALLOW_NONE: 9, HATE: 1, PROFANITY: 1, SEXUAL: 1, THREAT_OR_VIOLENCE: 1 }) || canonicalJson(payload.releaseContent.VALIDATION.languageDistribution) !== canonicalJson({ en: 13 }) || canonicalJson(payload.releaseContent.VALIDATION.scriptDistribution) !== canonicalJson({ LATIN: 11, MIXED: 2 })
    || payload.releaseContent.INTERNAL_TEST.candidateCount !== 13 || payload.releaseContent.INTERNAL_TEST.componentCount !== 11 || payload.releaseContent.INTERNAL_TEST.externalStatus !== "PROTECTED_INTERNAL_TEST" || payload.releaseContent.INTERNAL_TEST.trainingEligibleCount !== 0 || payload.releaseContent.INTERNAL_TEST.protectedMembershipDigest !== MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST || payload.releaseContent.INTERNAL_TEST.contentIncluded
    || payload.licenseObligations.licenseIdentifier !== "LICENSE.CC_BY_4_0" || !payload.licenseObligations.licenseUrl || !payload.licenseObligations.attributionRequired || !payload.licenseObligations.attribution || !payload.licenseObligations.changeNoticeRequired || !payload.licenseObligations.changeNotice
    || !payload.qualityAuthority.annotationResolved || !payload.qualityAuthority.piiClear || !payload.qualityAuthority.provenanceValid || payload.qualityAuthority.contaminationStatus !== "NO_DETECTED_OVERLAP" || !payload.qualityAuthority.groupingIntegrityIntact || !payload.qualityAuthority.lineageIntegrityIntact || !payload.qualityAuthority.dataQualityValid || payload.qualityAuthority.blockers.length
    || payload.materializationContract.trainingFilesMaterialized || payload.materializationContract.releaseContentMaterialized || payload.protections.candidateRowsMutated || payload.protections.splitManifestMutated || payload.protections.internalTestFreezeMutated || payload.protections.candidateTrainingEligibleFieldWritten || payload.protections.internalTestContentAccessed || payload.protections.frozen140Accessed || payload.protections.trainingExecuted || payload.protections.evaluationExecuted
    || !strictInstant(payload.createdAt) || releasePayloadDigest !== digest(payload)) throw new Error("Invalid MHS release manifest");
  if (eligibility) {
    validateMhsTrainingEligibilityManifestArtifact(eligibility);
    const bytes = Buffer.from(canonicalJson(eligibility), "utf8");
    if (payload.releaseAuthorityId !== eligibility.releaseAuthorityId || payload.authorities.eligibilityManifestSha256 !== sha256(bytes) || payload.authorities.eligibilityManifestPayloadDigest !== eligibility.eligibilityPayloadDigest) throw new Error("Release/eligibility authority mismatch");
  }
};

export const authorizeMhsReleasedCandidateAccess = (request: { readonly candidateId: string; readonly candidateTextDigest: string; readonly purpose: MhsReleasedAccessPurpose; readonly releaseVersion: string; readonly datasetVersion: string }, release: MhsReleaseManifestArtifact, eligibility: MhsTrainingEligibilityManifestArtifact, split: MhsSplitManifestArtifact): MhsReleasedAccessDecision => {
  try { validateMhsSplitManifestArtifact(split); } catch { return { allowed: false, status: "DENIED_AUTHORITY_MISMATCH" }; }
  const membership = split.candidateMembershipIndex.find((row) => row.candidateId === request.candidateId);
  if (!membership) return { allowed: false, status: "DENIED_UNKNOWN_CANDIDATE" };
  if (membership.split === "INTERNAL_TEST") return { allowed: false, status: "DENIED_PROTECTED_INTERNAL_TEST" };
  const entry = eligibility.entries.find((row) => row.candidateId === request.candidateId);
  if (!entry) return { allowed: false, status: "DENIED_MISSING_ELIGIBILITY" };
  if (entry.eligibility === "BLOCKED") return { allowed: false, status: "DENIED_BLOCKED_ELIGIBILITY" };
  try { validateMhsTrainingEligibilityManifestArtifact(eligibility); validateMhsReleaseManifestArtifact(release, eligibility); } catch { return { allowed: false, status: "DENIED_AUTHORITY_MISMATCH" }; }
  if (request.releaseVersion !== MHS_RELEASE_VERSION || request.datasetVersion !== MHS_DATASET_VERSION) return { allowed: false, status: "DENIED_STALE_RELEASE" };
  if (entry.candidateTextDigest !== request.candidateTextDigest) return { allowed: false, status: "DENIED_STALE_CANDIDATE" };
  if (request.purpose === "TRAINING" && membership.split === "TRAIN" && entry.split === "TRAIN" && entry.eligibility === "TRAINING_ELIGIBLE") return { allowed: true, status: "AUTHORIZED_TRAINING" };
  if (request.purpose === "VALIDATION" && membership.split === "VALIDATION" && entry.split === "VALIDATION" && entry.eligibility === "VALIDATION_AUTHORIZED") return { allowed: true, status: "AUTHORIZED_VALIDATION" };
  return { allowed: false, status: "DENIED_WRONG_SPLIT" };
};

export interface CreateMhsDatasetReleaseOptions {
  readonly candidatePath: string;
  readonly candidateIntegrityPath: string;
  readonly splitManifestPath: string;
  readonly internalTestFreezePath: string;
  readonly rEligibilityPlanPath: string;
  readonly semanticOverlayPath: string;
  readonly groupingUnionPlanPath: string;
  readonly contaminationAuditPath: string;
  readonly acquisitionManifestPath: string;
  readonly outputDirectory: string;
  readonly createdAt?: string;
  readonly publishPair?: (eligibilityTemporaryPath: string, eligibilityTargetPath: string, releaseTemporaryPath: string, releaseTargetPath: string) => void;
}

const publishPairDefault = (eligibilityTemporaryPath: string, eligibilityTargetPath: string, releaseTemporaryPath: string, releaseTargetPath: string): void => {
  fs.renameSync(eligibilityTemporaryPath, eligibilityTargetPath);
  fs.renameSync(releaseTemporaryPath, releaseTargetPath);
};

const publishImmutablePair = (outputDirectory: string, eligibilitySerialized: string, releaseSerialized: string, publishPair = publishPairDefault): { releasePath: string; eligibilityPath: string } => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const releasePath = path.join(outputDirectory, MHS_RELEASE_MANIFEST_FILENAME);
  const eligibilityPath = path.join(outputDirectory, MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME);
  if (fs.existsSync(releasePath) || fs.existsSync(eligibilityPath)) throw new Error("MHS release authority already exists; overwrite refused");
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const eligibilityTemporaryPath = path.join(outputDirectory, `.${MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME}.${token}.tmp`);
  const releaseTemporaryPath = path.join(outputDirectory, `.${MHS_RELEASE_MANIFEST_FILENAME}.${token}.tmp`);
  try {
    fs.writeFileSync(eligibilityTemporaryPath, eligibilitySerialized, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(releaseTemporaryPath, releaseSerialized, { encoding: "utf8", flag: "wx" });
    publishPair(eligibilityTemporaryPath, eligibilityPath, releaseTemporaryPath, releasePath);
    if (!fs.existsSync(eligibilityPath) || !fs.existsSync(releasePath) || fs.readFileSync(eligibilityPath, "utf8") !== eligibilitySerialized || fs.readFileSync(releasePath, "utf8") !== releaseSerialized) throw new Error("Incomplete paired release publication");
    return { releasePath, eligibilityPath };
  } catch (error) {
    for (const [filename, expected] of [[releasePath, releaseSerialized], [eligibilityPath, eligibilitySerialized]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true });
    for (const filename of [releaseTemporaryPath, eligibilityTemporaryPath]) fs.rmSync(filename, { force: true });
    throw error;
  } finally {
    for (const filename of [releaseTemporaryPath, eligibilityTemporaryPath]) fs.rmSync(filename, { force: true });
  }
};

export const createMhsDatasetRelease = (options: CreateMhsDatasetReleaseOptions): { readonly authorizationDecision: "AUTHORIZE_MHS_DATASET_RELEASE_V1"; readonly releasePath: string; readonly releaseSha256: string; readonly release: MhsReleaseManifestArtifact; readonly eligibilityPath: string; readonly eligibilitySha256: string; readonly eligibility: MhsTrainingEligibilityManifestArtifact } => {
  const authorityPaths = [options.candidatePath, options.candidateIntegrityPath, options.splitManifestPath, options.internalTestFreezePath, options.rEligibilityPlanPath, options.semanticOverlayPath, options.groupingUnionPlanPath, options.contaminationAuditPath, options.acquisitionManifestPath];
  const before = new Map(authorityPaths.map((filename) => [filename, fs.readFileSync(filename)]));
  exactBytes(options.candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256); // Hash-only: S never parses candidate text and cannot consume protected INTERNAL_TEST content.
  const integrity = readExact<MhsCandidateIntegrityAuditArtifact>(options.candidateIntegrityPath, MHS_CANDIDATE_INTEGRITY_SHA256, validateMhsCandidateIntegrityAuditArtifact);
  const split = readExact<MhsSplitManifestArtifact>(options.splitManifestPath, MHS_SPLIT_MANIFEST_SHA256, validateMhsSplitManifestArtifact);
  const freeze = readExact<MhsInternalTestFreezeArtifact>(options.internalTestFreezePath, MHS_INTERNAL_TEST_FREEZE_SHA256, validateMhsInternalTestFreezeArtifact);
  const plan = readExact<MhsTrainingEligibilityReleasePlanArtifact>(options.rEligibilityPlanPath, MHS_R_ELIGIBILITY_PLAN_SHA256, validateMhsTrainingEligibilityReleasePlanArtifact);
  readExact<MhsSemanticGroupingOverlayArtifact>(options.semanticOverlayPath, MHS_SEMANTIC_GROUPING_OVERLAY_SHA256, validateMhsSemanticGroupingOverlayArtifact);
  const grouping = readExact<MhsGroupingUnionSplitPlanArtifact>(options.groupingUnionPlanPath, MHS_GROUPING_UNION_SPLIT_PLAN_SHA256, validateMhsGroupingUnionSplitPlanArtifact);
  const contamination = readExact<MhsProtectedContaminationAuditArtifact>(options.contaminationAuditPath, MHS_CONTAMINATION_ARTIFACT_SHA256, validateMhsProtectedContaminationAuditArtifact);
  const acquisition = JSON.parse(exactBytes(options.acquisitionManifestPath, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256).toString("utf8")) as AcquisitionManifest;
  assertRegistries();
  const source = sourceRegistry.MEASURING_HATE_SPEECH; const license = licenseRegistry[source.sourceTextLicenseKey]; const acquired = acquisition.artifacts.filter((row) => row.sourceId === source.sourceId);
  const provenanceLicenseValid = acquisition.manifestVersion === ACQUISITION_MANIFEST_VERSION && acquired.length === 1 && acquired[0].revision === source.revision && acquired[0].sha256 === "0d65ce8cfb857f5db90e74ce295067bba7473fe12115715f9dd18d2a5f87e976" && source.approvedForTraining && source.commercialTrainingAssessment === "APPROVED" && source.redistributionAssessment === "APPROVED" && license?.reviewStatus === "REVIEWED" && license.commercialUseAssessment === "APPROVED" && license.redistributionAssessment === "APPROVED" && license.attributionRequired && license.noticeRequired && Boolean(license.authoritativeUrl);
  const protectedIds = new Set(freeze.protectedCandidateIds); const releaseIds = new Set([...plan.trainGateResults, ...plan.validationReadinessResults].map((row) => row.candidateId));
  const evidence: MhsReleaseAuthorizationEvidence = { trainAuthoritative: plan.counts.trainAuthoritative, trainQualifying: plan.counts.trainQualifying, trainBlocked: plan.counts.trainBlocked, validationAuthoritative: plan.counts.validationAuthoritative, validationReady: plan.counts.validationReady, validationBlocked: plan.counts.validationBlocked, protectedInternalTest: freeze.candidateCount, internalTestProtectionIntact: freeze.protectedMembershipDigest === MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST && freeze.freezePayloadDigest === MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST && [...protectedIds].every((id) => !releaseIds.has(id)), provenanceLicenseValid, contaminationClear: contamination.contaminationStatus === "NO_DETECTED_OVERLAP" && contamination.contaminationPayloadDigest === MHS_CONTAMINATION_PAYLOAD_DIGEST, groupingIntegrityIntact: grouping.planningPayloadDigest === MHS_GROUPING_UNION_SPLIT_PLAN_PAYLOAD_DIGEST && split.integrity.componentIsolationViolations === 0 && plan.componentLevelReleaseFindings.length === 0, candidateMembershipUnchanged: split.manifestId === MHS_SPLIT_MANIFEST_ID && split.candidateMembershipIndex.length === 86 && new Set(split.candidateMembershipIndex.map((row) => row.candidateId)).size === 86, unresolvedAnnotationPiiLineageCount: plan.summaries.dataQuality.invalidCount + plan.summaries.lineage.malformedLineageCount + plan.counts.trainBlocked + plan.counts.validationBlocked, immutablePairedPublicationAvailable: true };
  const authorizationDecision = decideMhsDatasetReleaseAuthorization(evidence);
  if (authorizationDecision !== "AUTHORIZE_MHS_DATASET_RELEASE_V1") throw new Error("DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1: release prerequisites failed");
  const releaseAuthorityId = `mhs_release_${digest([MHS_RELEASE_VERSION, MHS_DATASET_VERSION, MHS_CANDIDATE_ARTIFACT_SHA256, MHS_CANDIDATE_MEMBERSHIP_DIGEST, MHS_SPLIT_MANIFEST_SHA256, MHS_INTERNAL_TEST_FREEZE_SHA256, MHS_R_ELIGIBILITY_PLAN_SHA256])}`;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const entries: MhsEligibilityManifestEntry[] = [...plan.trainGateResults.map((row): MhsEligibilityManifestEntry => ({ candidateId: row.candidateId, candidateTextDigest: row.candidateTextDigest, split: "TRAIN", eligibility: "TRAINING_ELIGIBLE", evidenceDigest: row.eligibilityEvidenceDigest, releaseVersion: MHS_RELEASE_VERSION, datasetVersion: MHS_DATASET_VERSION })), ...plan.validationReadinessResults.map((row): MhsEligibilityManifestEntry => ({ candidateId: row.candidateId, candidateTextDigest: row.candidateTextDigest, split: "VALIDATION", eligibility: "VALIDATION_AUTHORIZED", evidenceDigest: row.eligibilityEvidenceDigest, releaseVersion: MHS_RELEASE_VERSION, datasetVersion: MHS_DATASET_VERSION }))].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const eligibilityPayload: MhsTrainingEligibilityManifestPayload = { schemaVersion: MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA, manifestVersion: MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION, phase: "T6L-6J-S", status: "EXTERNAL_TRAINING_AND_VALIDATION_ELIGIBILITY_AUTHORITY", releaseVersion: MHS_RELEASE_VERSION, datasetVersion: MHS_DATASET_VERSION, releaseAuthorityId, authorities: { candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, candidateMembershipDigest: MHS_CANDIDATE_MEMBERSHIP_DIGEST, splitManifestSha256: MHS_SPLIT_MANIFEST_SHA256, splitManifestPayloadDigest: MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST, internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, internalTestFreezePayloadDigest: MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST, rEligibilityPlanSha256: MHS_R_ELIGIBILITY_PLAN_SHA256, rEligibilityPlanPayloadDigest: MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST }, entries, protectedInternalTest: { status: "PROTECTED_INTERNAL_TEST", eligibility: "NOT_TRAINING_ELIGIBLE", candidateCount: 13, membershipDigest: MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST, contentIncluded: false }, counts: { trainingEligible: 60, validationAuthorized: 13, protectedInternalTest: 13, blocked: 0, candidateRowMutationCount: 0 }, loaderContract: { trainingRequires: ["candidate identity and digest match", "authoritative TRAIN membership", "matching authorized release authority", "TRAINING_ELIGIBLE status"], validationRequires: ["candidate identity and digest match", "authoritative VALIDATION membership", "matching authorized release authority", "VALIDATION_AUTHORIZED status"], failClosedStatuses: ["VALIDATION_FOR_TRAINING", "INTERNAL_TEST", "UNASSIGNED", "ANALYSIS_ONLY", "EXCLUDED", "UNKNOWN", "STALE", "MISSING_ELIGIBILITY", "BLOCKED", "WRONG_RELEASE"], internalTestDevelopmentAccess: "DENIED" }, protections: { candidateRowsMutated: false, candidateTrainingEligibleFieldWritten: false, splitMembershipMutated: false, internalTestContentAccessed: false, frozen140Accessed: false, trainingMaterialized: false, trainingExecuted: false, evaluationExecuted: false }, createdAt };
  const eligibility: MhsTrainingEligibilityManifestArtifact = { ...eligibilityPayload, eligibilityPayloadDigest: digest(eligibilityPayload) }; validateMhsTrainingEligibilityManifestArtifact(eligibility); const eligibilitySerialized = canonicalJson(eligibility); const eligibilitySha256 = sha256(Buffer.from(eligibilitySerialized, "utf8"));
  const rowsById = new Map(integrity.rows.map((row) => [row.sourceRowId, row])); const summarize = (target: "TRAIN" | "VALIDATION") => { const memberships = split.candidateMembershipIndex.filter((row) => row.split === target); const rows = memberships.map((membership) => rowsById.get(membership.candidateId)!); return { candidateCount: target === "TRAIN" ? 60 as const : 13 as const, externalStatus: target === "TRAIN" ? "TRAINING_ELIGIBLE" as const : "VALIDATION_AUTHORIZED" as const, decisionDistribution: tally(rows.map((row) => row.reviewerDecision)), categoryDistribution: tally(rows.map((row) => row.primaryCategory ?? "ALLOW_NONE")), languageDistribution: tally(rows.map((row) => row.language)), scriptDistribution: tally(rows.map((row) => row.script)), piiSummary: plan.summaries.pii[target] }; };
  const releasePayload: MhsReleaseManifestPayload = { schemaVersion: MHS_RELEASE_MANIFEST_SCHEMA, releaseVersion: MHS_RELEASE_VERSION, datasetVersion: MHS_DATASET_VERSION, policyVersion: DATASET_POLICY_VERSION, phase: "T6L-6J-S", status: "IMMUTABLE_AUTHORIZED_DATASET_RELEASE", releaseAuthorization: authorizationDecision, releaseAuthorityId, authorities: { candidateArtifactSha256: MHS_CANDIDATE_ARTIFACT_SHA256, candidatePayloadDigest: MHS_CANDIDATE_PAYLOAD_DIGEST, candidateMembershipDigest: MHS_CANDIDATE_MEMBERSHIP_DIGEST, candidateIntegrityArtifactSha256: MHS_CANDIDATE_INTEGRITY_SHA256, splitManifestSha256: MHS_SPLIT_MANIFEST_SHA256, splitManifestPayloadDigest: MHS_SPLIT_MANIFEST_PAYLOAD_DIGEST, internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256, internalTestFreezePayloadDigest: MHS_INTERNAL_TEST_FREEZE_PAYLOAD_DIGEST, rEligibilityPlanSha256: MHS_R_ELIGIBILITY_PLAN_SHA256, rEligibilityPlanPayloadDigest: MHS_R_ELIGIBILITY_PLAN_PAYLOAD_DIGEST, semanticGroupingOverlaySha256: MHS_SEMANTIC_GROUPING_OVERLAY_SHA256, groupingUnionPlanSha256: MHS_GROUPING_UNION_SPLIT_PLAN_SHA256, groupingUnionPlanPayloadDigest: MHS_GROUPING_UNION_SPLIT_PLAN_PAYLOAD_DIGEST, contaminationArtifactSha256: MHS_CONTAMINATION_ARTIFACT_SHA256, contaminationPayloadDigest: MHS_CONTAMINATION_PAYLOAD_DIGEST, acquisitionManifestSha256: TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256, sourceRegistryVersion: SOURCE_REGISTRY_VERSION, licenseRegistryVersion: LICENSE_REGISTRY_VERSION, eligibilityManifestSha256: eligibilitySha256, eligibilityManifestPayloadDigest: eligibility.eligibilityPayloadDigest }, source: { sourceId: "MEASURING_HATE_SPEECH", revision: source.revision, acquiredArtifactSha256: acquired[0].sha256 }, licenseObligations: { licenseIdentifier: "LICENSE.CC_BY_4_0", licenseName: license.name, licenseUrl: license.authoritativeUrl!, attributionRequired: true, attribution: source.citation, changeNoticeRequired: true, changeNotice: "STHN selected, human-reviewed, policy-mapped, and split records from the pinned source revision; redistributed material must indicate these changes." }, releaseContent: { TRAIN: summarize("TRAIN") as MhsReleaseManifestPayload["releaseContent"]["TRAIN"], VALIDATION: summarize("VALIDATION") as MhsReleaseManifestPayload["releaseContent"]["VALIDATION"], INTERNAL_TEST: { candidateCount: 13, componentCount: 11, externalStatus: "PROTECTED_INTERNAL_TEST", trainingEligibleCount: 0, protectedMembershipDigest: MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST, contentIncluded: false } }, qualityAuthority: { annotationResolved: true, piiClear: true, provenanceValid: true, contaminationStatus: "NO_DETECTED_OVERLAP", groupingIntegrityIntact: true, lineageIntegrityIntact: true, dataQualityValid: true, blockers: [] }, materializationContract: { candidateRowsRemainCanonical: true, datasetVersionInjectedOnlyDuringFutureMaterialization: true, trainingFilesMaterialized: false, releaseContentMaterialized: false }, protections: { candidateRowsMutated: false, splitManifestMutated: false, internalTestFreezeMutated: false, candidateTrainingEligibleFieldWritten: false, internalTestContentAccessed: false, frozen140Accessed: false, trainingExecuted: false, evaluationExecuted: false }, createdAt };
  const release: MhsReleaseManifestArtifact = { ...releasePayload, releasePayloadDigest: digest(releasePayload) }; validateMhsReleaseManifestArtifact(release, eligibility); const releaseSerialized = canonicalJson(release); const releaseSha256 = sha256(Buffer.from(releaseSerialized, "utf8"));
  for (const filename of authorityPaths) if (!before.get(filename)!.equals(fs.readFileSync(filename))) throw new Error(`S mutated upstream authority: ${filename}`);
  const published = publishImmutablePair(options.outputDirectory, eligibilitySerialized, releaseSerialized, options.publishPair);
  return { authorizationDecision, releasePath: published.releasePath, releaseSha256, release, eligibilityPath: published.eligibilityPath, eligibilitySha256, eligibility };
};
