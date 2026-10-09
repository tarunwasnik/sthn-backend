export const DATASET_SCHEMA_VERSION = "STHN_TEXT_MODERATION_DATASET_SCHEMA_V1" as const;
export const DATASET_POLICY_VERSION = "STHN_TEXT_MODERATION_POLICY_V1" as const;
export const SOURCE_REGISTRY_VERSION = "STHN_TEXT_MODERATION_SOURCE_REGISTRY_V1" as const;
export const LICENSE_REGISTRY_VERSION = "STHN_TEXT_MODERATION_LICENSE_REGISTRY_V1" as const;
export const ACQUISITION_MANIFEST_VERSION = "STHN_TEXT_MODERATION_ACQUISITION_MANIFEST_V1" as const;

export type SourceId =
  | "CIVIL_COMMENTS_1_2_4"
  | "TOXIGEN_ANNOTATED"
  | "MEASURING_HATE_SPEECH"
  | "HATEMOJI_BUILD"
  | "MULTILINGUAL_HATECHECK";

export type TrainingSourceId = Exclude<SourceId, "MULTILINGUAL_HATECHECK">;
export type AcquisitionMethod = "TFDS_PINNED" | "HF_REVISION" | "GIT_COMMIT";
export type Assessment = "APPROVED" | "CONDITIONAL" | "PROHIBITED";
export type ReviewStatus = "REVIEWED" | "LEGAL_REVIEW_REQUIRED";
export type DataSensitivity = "PUBLIC_TEXT_REQUIRES_PII_REVIEW" | "RESTRICTED_ANNOTATOR_METADATA";
export type SourceContentOrigin = "HUMAN_PUBLIC_COMMENT" | "MACHINE_GENERATED" | "EXPERT_GENERATED" | "DIAGNOSTIC_TEMPLATE";

export interface ExpectedArtifact {
  readonly artifactId: string;
  readonly filename: string;
  readonly authoritativeUrl: string;
  readonly configuration: string;
  readonly contentRole: string;
  readonly expectedSplit: string;
  readonly expectedRowCount: number;
  readonly expectedByteSize?: number;
  readonly expectedSha256?: string;
}

export interface SourceRegistryRecord {
  readonly sourceId: SourceId;
  readonly displayName: string;
  readonly publisher: string;
  readonly authoritativeUrl: string;
  readonly acquisitionMethod: AcquisitionMethod;
  readonly version: string;
  readonly revision: string;
  readonly configuration: readonly string[];
  readonly expectedArtifacts: readonly ExpectedArtifact[];
  readonly availableSplits: readonly string[];
  readonly languageCoverage: readonly string[];
  readonly contentOrigin: SourceContentOrigin;
  readonly annotationLicenseKey: LicenseKey;
  readonly sourceTextLicenseKey: LicenseKey;
  readonly accessTermsKey: LicenseKey;
  readonly commercialTrainingAssessment: Assessment;
  readonly redistributionAssessment: Assessment;
  readonly sourceTextRightsNotes: string;
  readonly stableRowIdentifierStrategy: string;
  readonly diagnosticOnly: boolean;
  readonly approvedForTraining: boolean;
  readonly dataSensitivity: DataSensitivity;
  readonly citation: string;
  readonly notes: readonly string[];
}

export type LicenseKey =
  | "LICENSE.CC0_1_0"
  | "LICENSE.CC_BY_4_0"
  | "LICENSE.CDLA_PERMISSIVE_2_0"
  | "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE";

export interface LicenseRegistryRecord {
  readonly licenseKey: LicenseKey;
  readonly name: string;
  readonly authoritativeUrl: string | null;
  readonly commercialUseAssessment: Assessment;
  readonly redistributionAssessment: Assessment;
  readonly attributionRequired: boolean;
  readonly noticeRequired: boolean;
  readonly shareAlike: boolean;
  readonly sourceTextCaveat: string | null;
  readonly reviewStatus: ReviewStatus;
  readonly reviewedAt: string;
  readonly notes: readonly string[];
}

export interface AcquisitionArtifactRecord {
  readonly sourceId: SourceId;
  readonly artifactId: string;
  readonly filename: string;
  readonly authoritativeUrl: string;
  readonly version: string;
  readonly revision: string;
  readonly configuration: string;
  readonly expectedSplit: string;
  readonly contentRole: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly upstreamChecksum: string | null;
  readonly retrievedAt: string;
}

export interface AcquisitionManifest {
  readonly manifestVersion: typeof ACQUISITION_MANIFEST_VERSION;
  readonly createdAt: string;
  readonly artifacts: readonly AcquisitionArtifactRecord[];
}

export type SourceScalar = string | number | boolean | null;
export type OriginalLabels = Readonly<Record<string, SourceScalar | readonly SourceScalar[] | Readonly<Record<string, SourceScalar>>>>;
export type DatasetSplit = "UNASSIGNED" | "TRAIN" | "VALIDATION" | "INTERNAL_TEST" | "ANALYSIS_ONLY" | "EXCLUDED";
export type PiiStatus = "NONE" | "REDACTED" | "REQUIRES_REVIEW" | "EXCLUDE";

export interface ProvenanceStagingRow {
  readonly schemaVersion: typeof DATASET_SCHEMA_VERSION;
  readonly policyVersion: typeof DATASET_POLICY_VERSION;
  readonly exampleId: string;
  readonly text: string;
  readonly decision: null;
  readonly primaryCategory: null;
  readonly secondaryCategories: readonly [];
  readonly policyReasonCode: null;
  readonly domain: "GENERAL_PUBLIC_DATA";
  readonly targetField: "GENERAL_TEXT";
  readonly language: string;
  readonly script: "LATIN" | "DEVANAGARI" | "THAI" | "MIXED" | "OTHER" | "UNKNOWN";
  readonly codeSwitch: "NONE" | "EN_HI" | "OTHER" | "UNKNOWN";
  readonly difficulty: null;
  readonly sourceType: "PUBLIC_HUMAN" | "PUBLIC_SYNTHETIC";
  readonly sourceDataset: SourceId;
  readonly sourceVersion: string;
  readonly sourceRowId: string;
  readonly sourceSplit: string;
  readonly sourceLicense: LicenseKey;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly originalLabels: OriginalLabels;
  readonly mappingVersion: null;
  readonly lineageRootId: string | null;
  readonly transformationHistory: readonly Readonly<Record<string, SourceScalar>>[];
  readonly generator: Readonly<{ generatorId: string; version: string | null; batchId: string | null }> | null;
  readonly nearPairGroupId: string | null;
  readonly templateFamilyId: string | null;
  readonly duplicateGroupId: null;
  readonly semanticGroupId: null;
  readonly piiStatus: PiiStatus;
  readonly piiTypes: readonly [];
  readonly annotationStatus: "DRAFT";
  readonly annotatorCount: 0;
  readonly agreement: "NOT_APPLICABLE";
  readonly adjudicated: false;
  readonly split: "UNASSIGNED";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RestrictedSidecarRecord {
  readonly sourceId: SourceId;
  readonly sourceRowId: string;
  readonly restricted: true;
  readonly metadata: Readonly<Record<string, SourceScalar>>;
}
