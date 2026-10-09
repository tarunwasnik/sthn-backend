import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { LICENSE_REGISTRY_VERSION, SOURCE_REGISTRY_VERSION } from "./contracts";
import { MHS_DATASET_VERSION } from "./mhsDatasetRelease";
import { MHS_RELEASE_MANIFEST_SHA256 } from "./mhsDevelopmentProjection";
import { MHS_SPLIT_MANIFEST_SHA256, MHS_SPLIT_MANIFEST_ID } from "./mhsInternalTestFreeze";
import { MHS_INTERNAL_TEST_FREEZE_SHA256, MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST, TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256 } from "./mhsTrainingEligibilityReleasePlan";
import { MHS_PIPELINE_DATA_INVESTIGATION_SHA256, readMhsTrainingPipelineDataInvestigation } from "./mhsTrainingPipelineDataInvestigation";
import { STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL, STHN_SEMANTIC_REVIEW_FLOOR } from "./semanticReviewPolicy";

export const MHS_TRAIN_EXPANSION_DESIGN_SCHEMA = "STHN_TEXT_MODERATION_TRAIN_EXPANSION_DESIGN_V1" as const;
export const MHS_TRAIN_EXPANSION_DESIGN_VERSION = "MHS_TRAIN_EXPANSION_DESIGN_V1" as const;
export const MHS_TRAIN_EXPANSION_DESIGN_FILENAME = "mhs-train-expansion-design-v1.json" as const;
export const MHS_TRAIN_EXPANSION_DATASET_VERSION = "STHN_TEXT_MODERATION_DATASET_MHS_V2" as const;
export const MHS_TRAIN_EXPANSION_ACQUISITION_SEED = "STHN-T6L-7I1-MHS-TRAIN-EXPANSION-2026-09-14" as const;
export const MHS_TRAIN_EXPANSION_DESIGN_SHA256 = "4a15cf6de9b610ed9efec3fd2e93af4710160caaa24c6bd2eaa4c07f3e37d04c" as const;
export const MHS_TRAIN_EXPANSION_DESIGN_PAYLOAD_DIGEST = "3d2280cc1538dec2bfc163bd93cbc7132735f766290713da9a42a4978717051c" as const;

const MHS_MAPPING_AUDIT_SUMMARY_SHA256 = "a16c965abc8d3ed847ff3f783563789d79aaab5f30a58154e1fcae0f2fa5ba48";
const MHS_REVIEW_TRANCHE_SUMMARY_SHA256 = "d4c67c3d7c336f6ae6817ce02259e68fc5e27a6e9f990524810412d93ba4fc4e";
const ACQUISITION_RESULTS_SHA256 = "c3a3ff1c694c453972d472f95a52cb67aab1918a113d942783b8f9b7474cbc2c";
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (filename: string): string => sha(fs.readFileSync(filename));
const canonical = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

type Category = "ABUSIVE_OR_HARASSING" | "HATE" | "PROFANITY" | "SEXUAL" | "THREAT_OR_VIOLENCE";
interface DesignPayload {
  readonly schemaVersion: typeof MHS_TRAIN_EXPANSION_DESIGN_SCHEMA;
  readonly designVersion: typeof MHS_TRAIN_EXPANSION_DESIGN_VERSION;
  readonly phase: "T6L-7I";
  readonly authorities: Record<string, string>;
  readonly priorVerdicts: { readonly pipeline: "PIPELINE_INTEGRITY_CERTIFIED"; readonly data: "CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING"; readonly authorizedInput: "AUTHORIZE_TRAIN_DATA_EXPANSION_DESIGN" };
  readonly currentDataset: {
    readonly datasetVersion: typeof MHS_DATASET_VERSION;
    readonly splitIdentity: { readonly manifestId: typeof MHS_SPLIT_MANIFEST_ID; readonly train: 60; readonly validation: 13; readonly internalTest: 13 };
    readonly train: { readonly total: 60; readonly ALLOW: 40; readonly BLOCK: 20; readonly blockCategories: Readonly<Record<Category, number>> };
    readonly validation: { readonly total: 13; readonly ALLOW: 9; readonly BLOCK: 4 };
    readonly internalTest: { readonly total: 13; readonly protected: true; readonly contentAccessed: false };
  };
  readonly sourceInventory: Record<string, unknown>;
  readonly targetEvaluation: readonly Record<string, unknown>[];
  readonly recommendation: Record<string, unknown>;
  readonly categoryPlan: Readonly<Record<Category, { readonly current: number; readonly floor: number; readonly target: number; readonly requiredNewToTarget: number }>>;
  readonly boundaryAllowGoals: Record<string, unknown>;
  readonly structuralDiversityGoals: Record<string, unknown>;
  readonly deterministicAcquisitionStrategy: Record<string, unknown>;
  readonly provenanceLicenseGates: Record<string, unknown>;
  readonly reviewAdmissionFlow: Record<string, unknown>;
  readonly semanticDuplicatePolicy: Record<string, unknown>;
  readonly leakageGroupingPolicy: Record<string, unknown>;
  readonly contaminationPolicy: Record<string, unknown>;
  readonly validationFreezePolicy: Record<string, unknown>;
  readonly versioningPlan: Record<string, unknown>;
  readonly preRun3DatasetGate: Record<string, unknown>;
  readonly plannedSubphases: readonly Record<string, unknown>[];
  readonly authorizationDecision: "AUTHORIZE_TRAIN_DATA_EXPANSION_ACQUISITION";
  readonly boundaries: Record<string, boolean>;
  readonly generatedAt: string;
}
export type MhsTrainExpansionDesign = DesignPayload & { readonly expansionPayloadDigest: string };

const categoryPlan: DesignPayload["categoryPlan"] = {
  ABUSIVE_OR_HARASSING: { current: 6, floor: 18, target: 20, requiredNewToTarget: 14 },
  HATE: { current: 4, floor: 16, target: 18, requiredNewToTarget: 14 },
  PROFANITY: { current: 3, floor: 10, target: 12, requiredNewToTarget: 9 },
  SEXUAL: { current: 7, floor: 18, target: 20, requiredNewToTarget: 13 },
  THREAT_OR_VIOLENCE: { current: 0, floor: 15, target: 20, requiredNewToTarget: 20 },
};

export const buildMhsTrainExpansionDesign = (generatedAt: string): MhsTrainExpansionDesign => {
  const payload: DesignPayload = {
    schemaVersion: MHS_TRAIN_EXPANSION_DESIGN_SCHEMA,
    designVersion: MHS_TRAIN_EXPANSION_DESIGN_VERSION,
    phase: "T6L-7I",
    authorities: {
      t6l7hInvestigationSha256: MHS_PIPELINE_DATA_INVESTIGATION_SHA256,
      currentReleaseManifestSha256: MHS_RELEASE_MANIFEST_SHA256,
      currentSplitManifestSha256: MHS_SPLIT_MANIFEST_SHA256,
      internalTestFreezeSha256: MHS_INTERNAL_TEST_FREEZE_SHA256,
      internalTestProtectedMembershipDigest: MHS_INTERNAL_TEST_PROTECTED_MEMBERSHIP_DIGEST,
      acquisitionManifestSha256: TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256,
      acquisitionResultsSha256: ACQUISITION_RESULTS_SHA256,
      mhsMappingAuditSummarySha256: MHS_MAPPING_AUDIT_SUMMARY_SHA256,
      mhsReviewTrancheSummarySha256: MHS_REVIEW_TRANCHE_SUMMARY_SHA256,
      sourceRegistryVersion: SOURCE_REGISTRY_VERSION,
      licenseRegistryVersion: LICENSE_REGISTRY_VERSION,
    },
    priorVerdicts: { pipeline: "PIPELINE_INTEGRITY_CERTIFIED", data: "CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING", authorizedInput: "AUTHORIZE_TRAIN_DATA_EXPANSION_DESIGN" },
    currentDataset: {
      datasetVersion: MHS_DATASET_VERSION,
      splitIdentity: { manifestId: MHS_SPLIT_MANIFEST_ID, train: 60, validation: 13, internalTest: 13 },
      train: { total: 60, ALLOW: 40, BLOCK: 20, blockCategories: { ABUSIVE_OR_HARASSING: 6, HATE: 4, PROFANITY: 3, SEXUAL: 7, THREAT_OR_VIOLENCE: 0 } },
      validation: { total: 13, ALLOW: 9, BLOCK: 4 },
      internalTest: { total: 13, protected: true, contentAccessed: false },
    },
    sourceInventory: {
      strategy: "MHS_ONLY_NEXT_TRANCHE",
      mhs: { pinnedRevision: "5468f6e118396646b02a2f691e771f6b6d9502ea", sourceComments: 39565, currentAdmittedIdentities: 86, outsideCurrentIdentities: 39479, existingTrancheRows: 3000, existingTrancheUnreviewedRows: 2900, outsideExistingTrancheRows: 36565, additionalHumanReviewedAdmissionReadyRows: 0, inventoryMeaning: "SOURCE_CANDIDATES_NOT_STHN_LABELS_OR_ADMISSIBLE_ROWS" },
      reviewedEvidence: { mappingAuditRows: 300, decisions: { ALLOW: 106, BLOCK: 172, EXCLUDE: 1, NEEDS_ADJUDICATION: 21 }, blockCategories: { ABUSIVE_OR_HARASSING: 54, HATE: 68, PROFANITY: 2, SEXUAL: 29, THREAT_OR_VIOLENCE: 25 }, automaticMappingAuthorized: false },
      existingTrancheProxySupply: { LOW_SCORE: 1526, CONTEXT_CANDIDATE: 1051, NON_HATE_ABUSE_CANDIDATE: 788, VIOLENCE: 1444, GENOCIDE: 744, DEHUMANIZATION: 2546, HIGH_DISAGREEMENT: 1364 },
      otherApprovedAcquiredSources: { HATEMOJI_BUILD: 5912, TOXIGEN_ANNOTATED: 9900 },
      unavailableOrDeferred: { CIVIL_COMMENTS_1_2_4: "ACQUISITION_BLOCKED_HTTP_403", additionalSources: "REQUIRE_SEPARATE_MAPPING_REVIEW_ADMISSION_ONBOARDING" },
    },
    targetEvaluation: [
      { totalTrain: 120, ratio: "60/40", ALLOW: 72, BLOCK: 48, newAllow: 32, newBlock: 28, growthMultiple: 2, reviewWorkload: "LOWEST", categoryCoverageAssessment: "TOO_THIN_FOR_FIVE_DURABLE_BLOCK_FLOORS" },
      { totalTrain: 160, ratio: "55/45", ALLOW: 88, BLOCK: 72, newAllow: 48, newBlock: 52, growthMultiple: 2.666667, reviewWorkload: "MODERATE", categoryCoverageAssessment: "MARGINAL_FOR_BOUNDARY_AND_RARE_CATEGORY_FLOORS" },
      { totalTrain: 200, ratio: "55/45", ALLOW: 110, BLOCK: 90, newAllow: 70, newBlock: 70, growthMultiple: 3.333333, reviewWorkload: "BOUNDED_HIGH", categoryCoverageAssessment: "RECOMMENDED_BALANCE_OF_SUPPORT_AND_REVIEW_BURDEN" },
      { totalTrain: 240, ratio: "55/45", ALLOW: 132, BLOCK: 108, newAllow: 92, newBlock: 88, growthMultiple: 4, reviewWorkload: "VERY_HIGH", categoryCoverageAssessment: "PLAUSIBLE_BUT_NOT_REQUIRED_FOR_FIRST_CONTROLLED_EXPANSION" },
    ],
    recommendation: { futureTrainTotal: 200, futureAllow: 110, futureBlock: 90, newAllowRequired: 70, newBlockRequired: 70, ratio: "55/45", rationale: "Materially expands the 60-row corpus, gives every policy category a durable floor, and preserves a bounded first MHS-only review program without imposing artificial 50/50 prevalence." },
    categoryPlan,
    boundaryAllowGoals: { minimumNewBoundaryAllow: 50, subfloors: { QUOTED_HARM_COUNTERSPEECH_REPORTING: 15, NON_ABUSIVE_PROFANITY_RECLAIMED_OR_AMBIGUOUS_SLANG: 10, NON_VIOLATING_SEXUAL_CONTEXT: 8, BENIGN_VIOLENCE_CONTEXT: 8, OTHER_POLICY_BOUNDARY_CONVERSATION: 9 }, policyAuthority: "EXISTING_STHN_POLICY_ONLY", inventedPolicyAllowed: false },
    structuralDiversityGoals: { textMutationAllowed: false, admittedNewRowFloors: { SHORT_ALLOW_WORDS_LE_5: 10, LONG_ALLOW_WORDS_GTE_40: 10, SHORT_BLOCK_WORDS_LE_5: 10, LONG_BLOCK_WORDS_GTE_40: 10 }, variedPunctuationRequired: true, variedLexicalStructureRequired: true, dominantTemplateCapFraction: 0.1, shortcutRiskAuditRequired: true },
    deterministicAcquisitionStrategy: { maximumSourceCandidateRows: 400, seed: MHS_TRAIN_EXPANSION_ACQUISITION_SEED, sourceRevision: "5468f6e118396646b02a2f691e771f6b6d9502ea", excludeCurrent86Identities: true, strata: { VIOLENCE_OR_GENOCIDE: 120, PROTECTED_DEHUMANIZATION_OR_HIGH_SCORE: 80, NON_HATE_ABUSE_OR_NO_CLEAR_PROTECTED_TARGET: 70, LOW_SCORE_CONTEXT_OR_COUNTERSPEECH: 70, DISAGREEMENT_OR_SOURCE_INCONSISTENCY: 60 }, overlapRouting: "HIGHEST_RISK_QUOTA_ONLY", tieBreaking: "ASCENDING_SHA256_OF_SEED_SOURCE_REVISION_SOURCE_ROW_ID", iterativePublication: false, sourceLabelsAreSelectionEvidenceOnly: true, stopCondition: "DO_NOT_RELEASE_UNTIL_ALL_PRE_RUN_3_DATASET_GATES_PASS" },
    provenanceLicenseGates: { sourceId: "MEASURING_HATE_SPEECH", sourceLicense: "CC_BY_4_0", pinnedRevisionRequired: true, acquiredArtifactHashRequired: true, stableIdentityRequired: true, attributionRequired: true, licenseLinkRequired: true, changeNoticeRequired: true, restrictedAnnotatorSidecarSeparationRequired: true, unresolvedPiiAllowed: false },
    reviewAdmissionFlow: { required: true, authority: "SOLE_REVIEWER_A_ESTABLISHED_AUTHORITY", sourceLabelsFinal: false, stages: ["SOURCE_INVENTORY_SELECTION", "BOUNDED_CANDIDATE_CREATION", "PROVENANCE_PII_AND_INTEGRITY_GATES", "HUMAN_POLICY_REVIEW", "TRIGGERED_SEMANTIC_DUPLICATE_REVIEW", "GROUPING", "CANDIDATE_ADMISSION", "V2_RELEASE_ELIGIBILITY", "FUTURE_TRAIN_EXPANSION_AUTHORITY"], autoPromotionAllowed: false, trainingEligibleBeforeRelease: false },
    semanticDuplicatePolicy: { semanticReviewFloor: STHN_SEMANTIC_REVIEW_FLOOR, highConfidenceSignal: STHN_SEMANTIC_HIGH_CONFIDENCE_SIGNAL, thresholdsChanged: false, comparisonsRequired: ["NEW_TO_NEW", "NEW_TO_EXISTING_TRAIN", "NEW_TO_EXISTING_VALIDATION", "NEW_TO_PROTECTED_AUTHORITIES_VIA_NON_EXPOSING_BOUNDARIES"], exactAndNormalizedDuplicateAuditRequired: true, sourcePairTemplateAndLineageAuditRequired: true, automaticMergeAllowed: false, humanReviewedEdgesRequired: true },
    leakageGroupingPolicy: { existingMembershipsMoved: false, groupIsolationRequired: true, newConnectionToValidationDisposition: "QUARANTINE_FROM_TRAIN", newConnectionToInternalTestDisposition: "QUARANTINE_FROM_TRAIN_WITHOUT_PROTECTED_TEXT_ACCESS", protectedMembersMovedToAccommodateNewRows: false, currentTrainValidationInternalTestFrozen: true },
    contaminationPolicy: { existingProtectedDetectorBoundaryRequired: true, internalTestContentExposed: false, frozen140ContentExposed: false, directProtectedContentComparisonAllowed: false, requiredStatuses: { INTERNAL_TEST: "NO_DETECTED_OVERLAP", FROZEN_140: "NO_DETECTED_OVERLAP", OTHER_PROTECTED_AUTHORITIES: "NO_DETECTED_OVERLAP" }, unresolvedFindingDisposition: "QUARANTINE_AND_BLOCK_RELEASE" },
    validationFreezePolicy: { currentValidationCount: 13, frozenForImmediateExpansion: true, expandedInThisLineage: false, rationale: "Preserve comparability with runs 1 and 2; consider a separately authorized validation expansion after TRAIN V2." },
    versioningPlan: { currentDatasetVersion: MHS_DATASET_VERSION, futureDatasetVersion: MHS_TRAIN_EXPANSION_DATASET_VERSION, mutateV1: false, newCandidateReviewAdmissionReleaseLineageRequired: true, currentReleaseSplitMaterializationModelsImmutable: true },
    preRun3DatasetGate: { run3DesignBlockedUntilPass: true, requiredFutureTrain: { total: 200, ALLOW: 110, BLOCK: 90 }, everyCategoryFloorRequired: categoryPlan, threatOrViolenceRequired: true, minimumNewBoundaryAllow: 50, humanReviewComplete: true, unresolvedPiiCount: 0, contaminationFindingsCount: 0, groupingIsolationViolations: 0, provenanceLicenseValid: true, releaseEligibilityComplete: true, v2ReleaseAuthorityRequired: true },
    plannedSubphases: [
      { phase: "T6L-7I1", purpose: "source inventory and deterministic tranche proposal" },
      { phase: "T6L-7I2", purpose: "authorized candidate acquisition and integrity audit" },
      { phase: "T6L-7I3", purpose: "sole-Reviewer-A human review packet and resolution" },
      { phase: "T6L-7I4", purpose: "semantic, duplicate, contamination, and grouping integrity" },
      { phase: "T6L-7I5", purpose: "TRAIN expansion release planning and V2 authorization gate" },
    ],
    authorizationDecision: "AUTHORIZE_TRAIN_DATA_EXPANSION_ACQUISITION",
    boundaries: { acquisitionPerformed: false, candidateRowsCreated: false, currentTrainMutated: false, validationMutated: false, internalTestMutated: false, internalTestAccessed: false, frozen140Mutated: false, frozen140Accessed: false, trainingPerformed: false, run3ConfigCreated: false, thresholdTuningPerformed: false, semanticThresholdsChanged: false, modelFamilyChanged: false, productionIntegrationPerformed: false },
    generatedAt,
  };
  return { ...payload, expansionPayloadDigest: sha(canonical(payload)) };
};

export const validateMhsTrainExpansionDesign = (artifact: MhsTrainExpansionDesign): void => {
  const { expansionPayloadDigest, ...payload } = artifact;
  const c = artifact.currentDataset, r = artifact.recommendation as Record<string, number | string>, d = artifact.deterministicAcquisitionStrategy as Record<string, unknown>, b = artifact.boundaries;
  if (artifact.schemaVersion !== MHS_TRAIN_EXPANSION_DESIGN_SCHEMA || artifact.designVersion !== MHS_TRAIN_EXPANSION_DESIGN_VERSION || artifact.phase !== "T6L-7I" || artifact.authorities.t6l7hInvestigationSha256 !== MHS_PIPELINE_DATA_INVESTIGATION_SHA256 || artifact.priorVerdicts.pipeline !== "PIPELINE_INTEGRITY_CERTIFIED" || artifact.priorVerdicts.data !== "CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING" || artifact.priorVerdicts.authorizedInput !== "AUTHORIZE_TRAIN_DATA_EXPANSION_DESIGN") throw new Error("Expansion design authority mismatch");
  if (c.datasetVersion !== MHS_DATASET_VERSION || c.splitIdentity.train !== 60 || c.splitIdentity.validation !== 13 || c.splitIdentity.internalTest !== 13 || c.train.ALLOW !== 40 || c.train.BLOCK !== 20 || c.train.blockCategories.THREAT_OR_VIOLENCE !== 0) throw new Error("Current dataset evidence mismatch");
  if (r.futureTrainTotal !== 200 || r.futureAllow !== 110 || r.futureBlock !== 90 || r.newAllowRequired !== 70 || r.newBlockRequired !== 70 || r.ratio !== "55/45") throw new Error("Expansion recommendation mismatch");
  if (Object.values(artifact.categoryPlan).some(x => x.floor <= x.current || x.target < x.floor) || artifact.categoryPlan.THREAT_OR_VIOLENCE.target <= 0 || Object.values(artifact.categoryPlan).reduce((n, x) => n + x.target, 0) !== 90) throw new Error("Category plan mismatch");
  if ((artifact.boundaryAllowGoals.minimumNewBoundaryAllow as number) < 50 || d.seed !== MHS_TRAIN_EXPANSION_ACQUISITION_SEED || d.maximumSourceCandidateRows !== 400) throw new Error("Acquisition strategy mismatch");
  if ((artifact.reviewAdmissionFlow.required as boolean) !== true || artifact.reviewAdmissionFlow.sourceLabelsFinal !== false || artifact.semanticDuplicatePolicy.semanticReviewFloor !== 0.85 || artifact.semanticDuplicatePolicy.highConfidenceSignal !== 0.94 || artifact.semanticDuplicatePolicy.automaticMergeAllowed !== false) throw new Error("Review/semantic policy mismatch");
  if (artifact.validationFreezePolicy.frozenForImmediateExpansion !== true || artifact.versioningPlan.mutateV1 !== false || artifact.preRun3DatasetGate.run3DesignBlockedUntilPass !== true || artifact.authorizationDecision !== "AUTHORIZE_TRAIN_DATA_EXPANSION_ACQUISITION") throw new Error("Freeze/version/authorization mismatch");
  if (Object.values(b).some(Boolean) || expansionPayloadDigest !== sha(canonical(payload)) || !/^[0-9a-f]{64}$/.test(expansionPayloadDigest) || new Date(artifact.generatedAt).toISOString() !== artifact.generatedAt) throw new Error("Expansion design boundary/canonical mismatch");
};

export const verifyMhsTrainExpansionDesignAuthorities = (root = process.cwd()): void => {
  const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
  const files: readonly [string, string][] = [
    [path.join(mhs, "training/mhs-xlm-roberta-pipeline-data-investigation-v1.json"), MHS_PIPELINE_DATA_INVESTIGATION_SHA256],
    [path.join(mhs, "release/mhs-release-manifest-v1.json"), MHS_RELEASE_MANIFEST_SHA256],
    [path.join(mhs, "splits/mhs-split-manifest-v1.json"), MHS_SPLIT_MANIFEST_SHA256],
    [path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), MHS_INTERNAL_TEST_FREEZE_SHA256],
    [path.resolve(root, "dataset-research/text-moderation/acquisition-manifest.json"), TEXT_MODERATION_ACQUISITION_MANIFEST_SHA256],
    [path.resolve(root, "dataset-research/text-moderation/acquisition-results.json"), ACQUISITION_RESULTS_SHA256],
    [path.join(mhs, "mhs-mapping-audit-v1-summary.json"), MHS_MAPPING_AUDIT_SUMMARY_SHA256],
    [path.join(mhs, "mhs-review-tranche-v1-summary.json"), MHS_REVIEW_TRANCHE_SUMMARY_SHA256],
  ];
  for (const [filename, expected] of files) if (shaFile(filename) !== expected) throw new Error(`Expansion design source mismatch: ${path.basename(filename)}`);
  const investigation = readMhsTrainingPipelineDataInvestigation(files[0][0]);
  if (investigation.pipelineVerdict !== "PIPELINE_INTEGRITY_CERTIFIED" || investigation.dataSufficiencyVerdict !== "CURRENT_TRAIN_DATA_INSUFFICIENT_FOR_NEXT_TUNING") throw new Error("T6L-7H verdict mismatch");
};

export const readMhsTrainExpansionDesign = (filename: string, verifySources = true): MhsTrainExpansionDesign => {
  const bytes = fs.readFileSync(filename);
  if (sha(bytes) !== MHS_TRAIN_EXPANSION_DESIGN_SHA256) throw new Error("Expansion design artifact SHA-256 mismatch");
  const artifact = JSON.parse(bytes.toString("utf8")) as MhsTrainExpansionDesign;
  validateMhsTrainExpansionDesign(artifact);
  if (verifySources) verifyMhsTrainExpansionDesignAuthorities();
  return artifact;
};

export const publishMhsTrainExpansionDesign = (bytes: Buffer, target: string, publish: (temporary: string, target: string) => void = fs.renameSync): void => {
  if (fs.existsSync(target)) throw new Error("Expansion design artifact exists; overwrite refused");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}-${Date.now()}.partial`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx" });
    publish(temporary, target);
    if (!fs.existsSync(target)) throw new Error("Expansion design publication incomplete");
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
};

export const serializeMhsTrainExpansionDesign = (artifact: MhsTrainExpansionDesign): Buffer => Buffer.from(canonical(artifact), "utf8");
