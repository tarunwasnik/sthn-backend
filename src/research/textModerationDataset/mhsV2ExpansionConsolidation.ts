import fs from "node:fs";
import path from "node:path";
import { DatasetSplit, LICENSE_REGISTRY_VERSION, SOURCE_REGISTRY_VERSION } from "./contracts";
import { TEXT_DUPLICATE_NORMALIZATION_VERSION } from "./identity";
import { canonicalJson, sha256 } from "./manifest";
import { MHS_CANDIDATE_STATES, MhsCandidateState } from "./mhsCandidateAdmission";
import { MHS_REVIEW_AUTHORITY_POLICY_VERSION } from "./mhsReviewTranche";
import {
  MhsV2ExpansionAcquisitionArtifact, MhsV2ExpansionCandidateArtifact,
  validateMhsV2ExpansionArtifacts,
} from "./mhsV2ExpansionCandidateAcquisition";
import {
  MhsV2HumanPiiFinalArtifact, validateMhsV2HumanPiiFinalDisposition,
} from "./mhsV2ExpansionHumanPiiDisposition";
import {
  MhsV2ReviewBatchImportArtifact, MhsV2ReviewBatchPlanArtifact, MhsV2ReviewUniverseArtifact,
  validateMhsV2ReviewBatchImport, validateMhsV2ReviewBatchPlan, validateMhsV2ReviewUniverse,
} from "./mhsV2ExpansionReviewerA";
import { licenseRegistry, sourceRegistry } from "./registries";

export const MHS_V2_EXPANSION_CONSOLIDATION_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_CONSOLIDATION_CERTIFICATION_V1" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_VERSION = "MHS_V2_EXPANSION_CONSOLIDATION_CERTIFICATION_V1" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_FILENAME = "mhs-v2-expansion-consolidation-certification-v1.json" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_GENERATED_AT = "2026-09-18T12:00:00.000Z" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_SHA256 = "698cf1005601c35b6f3bd1504f43971e3e242c4b3d5d2e92b13269db2b7ecbc9" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST = "d20e0711e39c162e94e9c670141c7be5e2b3c7fd66a0f956f407418ea81c04c1" as const;
export const MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST = "d7e9b98aa9ebc971b0e3c036f0da1608e1f352a798335e550be1aaf7079c724e" as const;
export const MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST = "e62f5a463ad6ee9928ab61d49e09d8ca8d0f34537acc5d2198b5f288c3b73625" as const;

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const tally = (values: readonly string[], keys?: readonly string[]): Readonly<Record<string, number>> => Object.fromEntries(
  (keys ?? [...new Set(values)].sort()).map((key) => [key, values.filter((value) => value === key).length]),
);

export interface MhsV2ConsolidationBatchAuthority {
  readonly batchNumber: number;
  readonly packetSha256: string;
  readonly blankTemplateSha256: string;
  readonly completedInputSha256: string;
  readonly validatedImportSha256: string;
  readonly artifact: MhsV2ReviewBatchImportArtifact;
}

export interface MhsV2ConsolidationAuthorities {
  readonly candidateArtifactSha256: string;
  readonly acquisitionArtifactSha256: string;
  readonly privacyDispositionArtifactSha256: string;
  readonly reviewUniverseArtifactSha256: string;
  readonly operationalPlanArtifactSha256: string;
  readonly splitManifestSha256: string;
  readonly internalTestFreezeMetadataSha256: string;
  readonly frozenExternalBenchmarkArtifactSha256: string;
  readonly existingV1CandidateArtifactSha256: string;
}

export interface MhsV2ExpansionConsolidationRow {
  readonly ordinal: number;
  readonly batchNumber: number;
  readonly batchId: string;
  readonly candidateId: string;
  readonly textSha256: string;
  readonly decision: "ALLOW" | "BLOCK" | "NEEDS_ADJUDICATION" | "EXCLUDE";
  readonly primaryCategory: string | null;
  readonly secondaryCategories: readonly string[];
  readonly reasonCode: string;
  readonly reviewerNote: string | null;
  readonly reviewerId: "reviewer_a_01";
  readonly reviewerRole: "A";
  readonly independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS";
  readonly reviewedAt: string;
  readonly piiStatus: "NONE" | "REDACTED" | "REQUIRES_REVIEW" | "EXCLUDE";
  readonly sourceDataset: "MEASURING_HATE_SPEECH";
  readonly sourceRevision: string;
  readonly language: string;
  readonly script: string;
  readonly selectionStratum: string;
  readonly lineageRootId: string;
  readonly exactDuplicateGroupId: null;
  readonly normalizedDuplicateGroupId: null;
  readonly lineageGroupId: null;
  readonly candidateState: MhsCandidateState;
  readonly candidateAdmitted: boolean;
  readonly trainingEligible: false;
  readonly split: Extract<DatasetSplit, "UNASSIGNED">;
}

export interface MhsV2ExpansionConsolidationPayload {
  readonly schemaVersion: typeof MHS_V2_EXPANSION_CONSOLIDATION_SCHEMA;
  readonly certificationVersion: typeof MHS_V2_EXPANSION_CONSOLIDATION_VERSION;
  readonly phase: "T6L-7J";
  readonly policyVersion: "STHN_TEXT_MODERATION_POLICY_V1";
  readonly datasetSchemaVersion: "STHN_TEXT_MODERATION_DATASET_SCHEMA_V1";
  readonly reviewAuthorityPolicyVersion: typeof MHS_REVIEW_AUTHORITY_POLICY_VERSION;
  readonly authorities: MhsV2ConsolidationAuthorities;
  readonly batches: readonly Omit<MhsV2ConsolidationBatchAuthority, "artifact">[];
  readonly rowCount: 400;
  readonly membershipDigest: string;
  readonly reviewerAuthorityDigest: string;
  readonly sourceRegistryVersion: typeof SOURCE_REGISTRY_VERSION;
  readonly licenseRegistryVersion: typeof LICENSE_REGISTRY_VERSION;
  readonly provenance: {
    readonly sourceDataset: "MEASURING_HATE_SPEECH";
    readonly sourceRevision: string;
    readonly sourceLicense: "LICENSE.CC_BY_4_0";
    readonly approvedForTraining: true;
    readonly commercialTrainingAssessment: "APPROVED";
    readonly attributionRequired: true;
    readonly noticeRequired: true;
  };
  readonly summary: {
    readonly batchCount: 10;
    readonly reviewedCount: 400;
    readonly uniqueCandidateCount: 400;
    readonly uniqueTextSha256Count: 400;
    readonly duplicateCandidateCount: 0;
    readonly duplicateTextSha256Count: 0;
    readonly unknownCandidateCount: 0;
    readonly missingCandidateCount: 0;
    readonly textBindingMismatchCount: 0;
    readonly positionalMismatchCount: 0;
    readonly decisionCounts: Readonly<Record<string, number>>;
    readonly primaryCategoryCounts: Readonly<Record<string, number>>;
    readonly secondaryCategoryCounts: Readonly<Record<string, number>>;
    readonly reasonCodeCounts: Readonly<Record<string, number>>;
    readonly languageCounts: Readonly<Record<string, number>>;
    readonly scriptCounts: Readonly<Record<string, number>>;
    readonly provenanceCounts: Readonly<Record<string, number>>;
    readonly privacyStatusCounts: Readonly<Record<string, number>>;
    readonly candidateStateCounts: Readonly<Record<string, number>>;
    readonly candidateAdmittedCount: number;
    readonly requiresAdditionalReviewerCount: 0;
    readonly requiresAdjudicationCount: number;
    readonly privacyBlockedCount: number;
    readonly excludedCount: number;
    readonly trainingEligibleCount: 0;
    readonly validationAuthorizedCount: 0;
  };
  readonly annotationCertification: {
    readonly reviewerARequirementSatisfiedCount: 400;
    readonly reviewerBRequiredCount: 0;
    readonly separateAuditRequiredCount: 0;
    readonly disagreementComparisonRequiredCount: 0;
    readonly adjudicationRequiredCount: number;
    readonly unresolvedAnnotationCount: number;
  };
  readonly leakageCertification: {
    readonly normalizationVersion: typeof TEXT_DUPLICATE_NORMALIZATION_VERSION;
    readonly exactDuplicateGroupCount: 0;
    readonly normalizedDuplicateGroupCount: 0;
    readonly sharedLineageGroupCount: 0;
    readonly currentLifecycleExactMatchCount: 0;
    readonly currentLifecycleNormalizedMatchCount: 0;
    readonly existingSplitIdentityOverlapCount: 0;
    readonly nearPairAuthority: "NOT_AVAILABLE";
    readonly templateFamilyAuthority: "NOT_AVAILABLE";
    readonly semanticSimilarityExecuted: false;
    readonly semanticGroupingAuthorityPresent: false;
    readonly preliminarySingletonComponentCount: 400;
    readonly finalConnectedComponentCertification: false;
  };
  readonly progressionCertification: {
    readonly candidateAdmissionAuthorizedCount: number;
    readonly trainingEligibilityAuthorizedCount: 0;
    readonly validationUseAuthorizedCount: 0;
    readonly splitAssignmentAuthorizedCount: 0;
    readonly explicitReleaseAuthorityPresent: false;
    readonly v2ProtectedContaminationAuthorityPresent: false;
    readonly v2SemanticComponentAuthorityPresent: false;
    readonly directTrainValidationConstructionAuthorized: false;
  };
  readonly protectedEvaluationBoundaries: {
    readonly internalTestContentAccessed: false;
    readonly frozenExternalBenchmarkContentAccessed: false;
    readonly frozenExternalBenchmarkMetadataHashVerified: true;
    readonly v2ProtectedOverlapDetermined: false;
  };
  readonly rows: readonly MhsV2ExpansionConsolidationRow[];
  readonly generatedAt: typeof MHS_V2_EXPANSION_CONSOLIDATION_GENERATED_AT;
}

export type MhsV2ExpansionConsolidationArtifact = MhsV2ExpansionConsolidationPayload & { readonly certificationPayloadDigest: string };

export interface CreateMhsV2ExpansionConsolidationInput {
  readonly candidate: MhsV2ExpansionCandidateArtifact;
  readonly acquisition: MhsV2ExpansionAcquisitionArtifact;
  readonly privacy: MhsV2HumanPiiFinalArtifact;
  readonly universe: MhsV2ReviewUniverseArtifact;
  readonly plan: MhsV2ReviewBatchPlanArtifact;
  readonly batchAuthorities: readonly MhsV2ConsolidationBatchAuthority[];
  readonly authorities: MhsV2ConsolidationAuthorities;
  readonly existingSplitCandidateIds: ReadonlySet<string>;
}

const candidateState = (decision: MhsV2ExpansionConsolidationRow["decision"], piiStatus: MhsV2ExpansionConsolidationRow["piiStatus"]): MhsCandidateState => {
  if (decision === "EXCLUDE" || piiStatus === "EXCLUDE") return "EXCLUDED";
  if (decision === "NEEDS_ADJUDICATION") return "BLOCKED_ADJUDICATION";
  if (piiStatus === "REQUIRES_REVIEW") return "BLOCKED_PII_REVIEW";
  if (piiStatus !== "NONE" && piiStatus !== "REDACTED") throw new Error("Invalid V2 consolidation privacy state");
  return decision === "ALLOW" ? "ADMITTED_ALLOW" : "ADMITTED_BLOCK";
};

export const createMhsV2ExpansionConsolidation = (input: CreateMhsV2ExpansionConsolidationInput): MhsV2ExpansionConsolidationArtifact => {
  validateMhsV2ExpansionArtifacts(input.candidate, input.acquisition);
  validateMhsV2HumanPiiFinalDisposition(input.privacy);
  validateMhsV2ReviewUniverse(input.universe);
  validateMhsV2ReviewBatchPlan(input.plan, input.universe);
  if (input.batchAuthorities.length !== 10 || new Set(input.batchAuthorities.map((batch) => batch.batchNumber)).size !== 10) throw new Error("T6L-7J requires exactly ten unique validated batches");
  const batches = [...input.batchAuthorities].sort((left, right) => left.batchNumber - right.batchNumber);
  batches.forEach(({ artifact }, index) => { validateMhsV2ReviewBatchImport(artifact); const planned = input.plan.batches[index]; if (!planned || artifact.batchNumber !== index + 1 || artifact.batchId !== planned.batchId || artifact.rowCount !== planned.memberCount || artifact.membershipDigest !== planned.membershipDigest || artifact.universeArtifactSha256 !== input.authorities.reviewUniverseArtifactSha256 || artifact.universePayloadDigest !== input.universe.universePayloadDigest) throw new Error("T6L-7J batch authority does not match the frozen operational plan"); });
  const decisions = batches.flatMap((batch) => batch.artifact.decisions.map((decision) => ({ batchNumber: batch.batchNumber, batchId: batch.artifact.batchId, ...decision })));
  const decisionIds = decisions.map((row) => row.candidateId), decisionHashes = decisions.map((row) => row.textSha256);
  if (decisions.length !== 400 || new Set(decisionIds).size !== 400 || new Set(decisionHashes).size !== 400) throw new Error("T6L-7J review union contains duplicate or missing identities");
  const candidates = new Map(input.candidate.rows.map((row) => [row.candidateId, row]));
  const privacy = new Map(input.privacy.finalRows.map((row) => [row.candidateId, row]));
  const rows = decisions.map((review, index): MhsV2ExpansionConsolidationRow => {
    const member = input.universe.members[index], source = candidates.get(review.candidateId), pii = privacy.get(review.candidateId);
    if (!member || !source || !pii || member.ordinal !== index + 1 || member.candidateId !== review.candidateId || member.textSha256 !== review.textSha256 || source.exactTextDigest !== review.textSha256 || pii.textSha256 !== review.textSha256) throw new Error("T6L-7J positional, candidate, or text binding mismatch");
    const state = candidateState(review.decision, pii.piiStatus); const admitted = state === "ADMITTED_ALLOW" || state === "ADMITTED_BLOCK";
    return { ordinal: index + 1, batchNumber: review.batchNumber, batchId: review.batchId, candidateId: review.candidateId, textSha256: review.textSha256,
      decision: review.decision, primaryCategory: review.primaryCategory, secondaryCategories: [...review.secondaryCategories], reasonCode: review.reasonCode,
      reviewerNote: review.reviewerNote, reviewerId: review.reviewerId, reviewerRole: "A", independenceDeclaration: review.independenceDeclaration,
      reviewedAt: review.reviewedAt, piiStatus: pii.piiStatus, sourceDataset: source.sourceDataset, sourceRevision: source.sourceRevision,
      language: source.language, script: source.script, selectionStratum: source.selectionStratum, lineageRootId: source.lineageRootId,
      exactDuplicateGroupId: null, normalizedDuplicateGroupId: null, lineageGroupId: null, candidateState: state, candidateAdmitted: admitted,
      trainingEligible: false, split: "UNASSIGNED" };
  });
  const source = sourceRegistry.MEASURING_HATE_SPEECH, license = licenseRegistry[source.sourceTextLicenseKey];
  if (!source.approvedForTraining || source.commercialTrainingAssessment !== "APPROVED" || source.sourceTextLicenseKey !== "LICENSE.CC_BY_4_0" || !license.attributionRequired || !license.noticeRequired) throw new Error("T6L-7J provenance or license authority is not model-development compatible");
  const exactDuplicateCount = rows.length - new Set(input.candidate.rows.map((row) => row.exactTextDigest)).size;
  const normalizedDuplicateCount = rows.length - new Set(input.candidate.rows.map((row) => row.normalizedTextFingerprint)).size;
  const lineageDuplicateCount = rows.length - new Set(input.candidate.rows.map((row) => row.lineageRootId)).size;
  const existingSplitIdentityOverlapCount = rows.filter((row) => input.existingSplitCandidateIds.has(row.candidateId)).length;
  if (exactDuplicateCount || normalizedDuplicateCount || lineageDuplicateCount || existingSplitIdentityOverlapCount) throw new Error("T6L-7J frozen duplicate, lineage, or existing-split state changed");
  const admitted = rows.filter((row) => row.candidateAdmitted), adjudication = rows.filter((row) => row.candidateState === "BLOCKED_ADJUDICATION").length;
  const privacyBlocked = rows.filter((row) => row.candidateState === "BLOCKED_PII_REVIEW").length, excluded = rows.filter((row) => row.candidateState === "EXCLUDED").length;
  const summary = {
    batchCount: 10 as const, reviewedCount: 400 as const, uniqueCandidateCount: 400 as const, uniqueTextSha256Count: 400 as const,
    duplicateCandidateCount: 0 as const, duplicateTextSha256Count: 0 as const, unknownCandidateCount: 0 as const, missingCandidateCount: 0 as const,
    textBindingMismatchCount: 0 as const, positionalMismatchCount: 0 as const,
    decisionCounts: tally(rows.map((row) => row.decision), ["ALLOW", "BLOCK", "NEEDS_ADJUDICATION", "EXCLUDE"]),
    primaryCategoryCounts: tally(rows.filter((row) => row.decision === "BLOCK").map((row) => row.primaryCategory!), ["PROFANITY", "SEXUAL", "ABUSIVE_OR_HARASSING", "HATE", "THREAT_OR_VIOLENCE", "OTHER_INAPPROPRIATE"]),
    secondaryCategoryCounts: tally(rows.filter((row) => row.decision === "BLOCK").flatMap((row) => row.secondaryCategories), ["PROFANITY", "SEXUAL", "ABUSIVE_OR_HARASSING", "HATE", "THREAT_OR_VIOLENCE", "OTHER_INAPPROPRIATE"]),
    reasonCodeCounts: tally(rows.map((row) => row.reasonCode)), languageCounts: tally(rows.map((row) => row.language)), scriptCounts: tally(rows.map((row) => row.script)),
    provenanceCounts: tally(rows.map((row) => row.sourceDataset)), privacyStatusCounts: tally(rows.map((row) => row.piiStatus), ["NONE", "REDACTED", "REQUIRES_REVIEW", "EXCLUDE"]),
    candidateStateCounts: tally(rows.map((row) => row.candidateState), MHS_CANDIDATE_STATES), candidateAdmittedCount: admitted.length,
    requiresAdditionalReviewerCount: 0 as const, requiresAdjudicationCount: adjudication, privacyBlockedCount: privacyBlocked, excludedCount: excluded,
    trainingEligibleCount: 0 as const, validationAuthorizedCount: 0 as const,
  };
  const batchBindings = batches.map(({ artifact, ...authority }) => ({ ...authority, batchNumber: artifact.batchNumber }));
  const payload: MhsV2ExpansionConsolidationPayload = {
    schemaVersion: MHS_V2_EXPANSION_CONSOLIDATION_SCHEMA, certificationVersion: MHS_V2_EXPANSION_CONSOLIDATION_VERSION, phase: "T6L-7J",
    policyVersion: "STHN_TEXT_MODERATION_POLICY_V1", datasetSchemaVersion: "STHN_TEXT_MODERATION_DATASET_SCHEMA_V1",
    reviewAuthorityPolicyVersion: MHS_REVIEW_AUTHORITY_POLICY_VERSION, authorities: input.authorities, batches: batchBindings,
    rowCount: 400, membershipDigest: digest(rows.map(({ candidateId, textSha256 }) => ({ candidateId, textSha256 }))),
    reviewerAuthorityDigest: digest(rows.map(({ candidateId, textSha256, decision, primaryCategory, secondaryCategories, reasonCode, reviewerNote, reviewerId, reviewerRole, independenceDeclaration, reviewedAt }) => ({ candidateId, textSha256, decision, primaryCategory, secondaryCategories, reasonCode, reviewerNote, reviewerId, reviewerRole, independenceDeclaration, reviewedAt }))),
    sourceRegistryVersion: SOURCE_REGISTRY_VERSION, licenseRegistryVersion: LICENSE_REGISTRY_VERSION,
    provenance: { sourceDataset: "MEASURING_HATE_SPEECH", sourceRevision: source.revision, sourceLicense: "LICENSE.CC_BY_4_0", approvedForTraining: true, commercialTrainingAssessment: "APPROVED", attributionRequired: true, noticeRequired: true },
    summary,
    annotationCertification: { reviewerARequirementSatisfiedCount: 400, reviewerBRequiredCount: 0, separateAuditRequiredCount: 0, disagreementComparisonRequiredCount: 0, adjudicationRequiredCount: adjudication, unresolvedAnnotationCount: adjudication },
    leakageCertification: { normalizationVersion: TEXT_DUPLICATE_NORMALIZATION_VERSION, exactDuplicateGroupCount: 0, normalizedDuplicateGroupCount: 0, sharedLineageGroupCount: 0,
      currentLifecycleExactMatchCount: 0, currentLifecycleNormalizedMatchCount: 0, existingSplitIdentityOverlapCount: 0, nearPairAuthority: "NOT_AVAILABLE", templateFamilyAuthority: "NOT_AVAILABLE",
      semanticSimilarityExecuted: false, semanticGroupingAuthorityPresent: false, preliminarySingletonComponentCount: 400, finalConnectedComponentCertification: false },
    progressionCertification: { candidateAdmissionAuthorizedCount: admitted.length, trainingEligibilityAuthorizedCount: 0, validationUseAuthorizedCount: 0, splitAssignmentAuthorizedCount: 0,
      explicitReleaseAuthorityPresent: false, v2ProtectedContaminationAuthorityPresent: false, v2SemanticComponentAuthorityPresent: false, directTrainValidationConstructionAuthorized: false },
    protectedEvaluationBoundaries: { internalTestContentAccessed: false, frozenExternalBenchmarkContentAccessed: false, frozenExternalBenchmarkMetadataHashVerified: true, v2ProtectedOverlapDetermined: false },
    rows, generatedAt: MHS_V2_EXPANSION_CONSOLIDATION_GENERATED_AT,
  };
  const artifact = { ...payload, certificationPayloadDigest: digest(payload) }; validateMhsV2ExpansionConsolidation(artifact); return artifact;
};

export const validateMhsV2ExpansionConsolidation = (artifact: MhsV2ExpansionConsolidationArtifact): void => {
  const { certificationPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_EXPANSION_CONSOLIDATION_SCHEMA || artifact.certificationVersion !== MHS_V2_EXPANSION_CONSOLIDATION_VERSION || artifact.phase !== "T6L-7J"
    || artifact.reviewAuthorityPolicyVersion !== MHS_REVIEW_AUTHORITY_POLICY_VERSION || artifact.rowCount !== 400 || artifact.rows.length !== 400 || artifact.batches.length !== 10
    || new Set(artifact.rows.map((row) => row.candidateId)).size !== 400 || new Set(artifact.rows.map((row) => row.textSha256)).size !== 400
    || artifact.rows.some((row, index) => row.ordinal !== index + 1 || row.trainingEligible || row.split !== "UNASSIGNED" || row.reviewerRole !== "A" || row.reviewerId !== "reviewer_a_01")
    || artifact.membershipDigest !== MHS_V2_EXPANSION_CONSOLIDATION_MEMBERSHIP_DIGEST || artifact.membershipDigest !== digest(artifact.rows.map(({ candidateId, textSha256 }) => ({ candidateId, textSha256 })))
    || artifact.reviewerAuthorityDigest !== MHS_V2_EXPANSION_REVIEWER_AUTHORITY_DIGEST
    || artifact.summary.reviewedCount !== 400 || artifact.summary.trainingEligibleCount !== 0 || artifact.summary.validationAuthorizedCount !== 0
    || artifact.annotationCertification.reviewerBRequiredCount !== 0 || artifact.annotationCertification.separateAuditRequiredCount !== 0
    || artifact.progressionCertification.directTrainValidationConstructionAuthorized || artifact.protectedEvaluationBoundaries.internalTestContentAccessed || artifact.protectedEvaluationBoundaries.frozenExternalBenchmarkContentAccessed
    || certificationPayloadDigest !== MHS_V2_EXPANSION_CONSOLIDATION_PAYLOAD_DIGEST || certificationPayloadDigest !== digest(payload) || JSON.stringify(artifact).includes('"text"')) throw new Error("Invalid MHS V2 expansion consolidation certification");
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2ExpansionConsolidation = (artifact: MhsV2ExpansionConsolidationArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => {
  validateMhsV2ExpansionConsolidation(artifact); fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, MHS_V2_EXPANSION_CONSOLIDATION_FILENAME); if (fs.existsSync(target)) throw new Error("MHS V2 consolidation certification exists; overwrite refused");
  const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}.partial`;
  try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete MHS V2 consolidation publication"); return target; }
  catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; }
  finally { fs.rmSync(temporary, { force: true }); }
};
