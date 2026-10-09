import {
  DATASET_POLICY_VERSION,
  DATASET_SCHEMA_VERSION,
  LICENSE_REGISTRY_VERSION,
  LicenseKey,
  LicenseRegistryRecord,
  SOURCE_REGISTRY_VERSION,
  SourceId,
  SourceRegistryRecord,
  TrainingSourceId,
} from "./contracts";

const reviewedAt = "2026-09-08";
const githubRaw = "https://raw.githubusercontent.com/HannahKirk/Hatemoji/a626f63216158748d072e581efc00267031f4404/HatemojiBuild";
const toxigenRaw = "https://huggingface.co/datasets/toxigen/toxigen-data/resolve/ea082a8973a287097b17973343576e0c8da8eb3b";

export const licenseRegistry: Readonly<Record<LicenseKey, LicenseRegistryRecord>> = {
  "LICENSE.CC0_1_0": {
    licenseKey: "LICENSE.CC0_1_0", name: "CC0 1.0 Universal", authoritativeUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    commercialUseAssessment: "APPROVED", redistributionAssessment: "APPROVED", attributionRequired: false,
    noticeRequired: false, shareAlike: false, sourceTextCaveat: null, reviewStatus: "REVIEWED", reviewedAt, notes: [],
  },
  "LICENSE.CC_BY_4_0": {
    licenseKey: "LICENSE.CC_BY_4_0", name: "Creative Commons Attribution 4.0 International", authoritativeUrl: "https://creativecommons.org/licenses/by/4.0/legalcode",
    commercialUseAssessment: "APPROVED", redistributionAssessment: "APPROVED", attributionRequired: true,
    noticeRequired: true, shareAlike: false, sourceTextCaveat: null, reviewStatus: "REVIEWED", reviewedAt,
    notes: ["Attribution, license link, and change indication must accompany redistributed material."],
  },
  "LICENSE.CDLA_PERMISSIVE_2_0": {
    licenseKey: "LICENSE.CDLA_PERMISSIVE_2_0", name: "Community Data License Agreement Permissive 2.0", authoritativeUrl: "https://cdla.dev/permissive-2-0/",
    commercialUseAssessment: "APPROVED", redistributionAssessment: "APPROVED", attributionRequired: false,
    noticeRequired: true, shareAlike: false, sourceTextCaveat: "The agreement text must accompany shared data.",
    reviewStatus: "REVIEWED", reviewedAt, notes: ["No restrictions are imposed on computational results."],
  },
  "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE": {
    licenseKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE", name: "Public authoritative source access", authoritativeUrl: null,
    commercialUseAssessment: "CONDITIONAL", redistributionAssessment: "CONDITIONAL", attributionRequired: false,
    noticeRequired: false, shareAlike: false, sourceTextCaveat: "This key records access-channel status and does not grant content rights.",
    reviewStatus: "REVIEWED", reviewedAt, notes: ["Content and annotation licenses remain independently controlling."],
  },
};

const hatemojiArtifacts = [["train", "train", 4728], ["validation", "dev", 591], ["test", "test", 593]].map(([filename, nativeSplit, expectedRowCount]) => ({
  artifactId: `hatemoji-${filename}`, filename: `${filename}.csv`, authoritativeUrl: `${githubRaw}/${filename}.csv`,
  configuration: "HatemojiBuild", contentRole: "source-split", expectedSplit: String(nativeSplit), expectedRowCount: Number(expectedRowCount),
}));
const toxigenArtifacts = [["train", 8960], ["test", 940]].map(([split, expectedRowCount]) => ({
  artifactId: `toxigen-annotated-${split}`, filename: `annotated_${split}.csv`, authoritativeUrl: `${toxigenRaw}/annotated_${split}.csv`,
  configuration: "annotated", contentRole: "human-validated-source-split", expectedSplit: String(split), expectedRowCount: Number(expectedRowCount),
}));
const civilArtifacts = [{
  artifactId: "civil-comments-v1.2-archive", filename: "civil_comments_v1.2.zip",
  authoritativeUrl: "https://storage.googleapis.com/jigsaw-unintended-bias-in-toxicity-classification/civil_comments_v1.2.zip",
  configuration: "CivilComments", contentRole: "TFDS-authoritative raw archive", expectedSplit: "train|test_public|test_private", expectedRowCount: 1999514,
  expectedByteSize: 448174578, expectedSha256: "89a60573acbbfaf189b2c77278115eefcbc1654dbd8235dd8fbecc1b83f1585c",
}];
const measuringHateSpeechArtifacts = [{
  artifactId: "measuring-hate-speech-train-00000", filename: "train-00000-of-00001.parquet",
  authoritativeUrl: "https://huggingface.co/datasets/ucberkeley-dlab/measuring-hate-speech/resolve/5468f6e118396646b02a2f691e771f6b6d9502ea/data/train-00000-of-00001.parquet",
  configuration: "default", contentRole: "publisher-pinned annotation-row split", expectedSplit: "train", expectedRowCount: 135556,
  expectedByteSize: 20097387, expectedSha256: "0d65ce8cfb857f5db90e74ce295067bba7473fe12115715f9dd18d2a5f87e976",
}];

export const sourceRegistry: Readonly<Record<SourceId, SourceRegistryRecord>> = {
  CIVIL_COMMENTS_1_2_4: {
    sourceId: "CIVIL_COMMENTS_1_2_4", displayName: "Civil Comments", publisher: "Jigsaw / Civil Comments via TensorFlow Datasets",
    authoritativeUrl: "https://www.tensorflow.org/datasets/catalog/civil_comments", acquisitionMethod: "TFDS_PINNED", version: "1.2.4", revision: "1.2.4",
    configuration: ["CivilComments", "CivilCommentsIdentities"], expectedArtifacts: civilArtifacts, availableSplits: ["train", "validation", "test"], languageCoverage: ["en"],
    contentOrigin: "HUMAN_PUBLIC_COMMENT", annotationLicenseKey: "LICENSE.CC0_1_0", sourceTextLicenseKey: "LICENSE.CC0_1_0",
    accessTermsKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE", commercialTrainingAssessment: "APPROVED", redistributionAssessment: "APPROVED",
    sourceTextRightsNotes: "TFDS states that the dataset and underlying Civil Comments text are CC0.",
    stableRowIdentifierStrategy: "sha256(sourceId, version, config, sourceSplit, native id)", diagnosticOnly: false, approvedForTraining: true,
    dataSensitivity: "PUBLIC_TEXT_REQUIRES_PII_REVIEW", citation: "Borkan et al. (2019), Nuanced Metrics for Measuring Unintended Bias with Real Data for Text Classification",
    notes: ["TFDS 1.2.4 directly identifies and checksums civil_comments_v1.2.zip; native split values are train, test_public, and test_private.", "CivilCommentsIdentities may only enrich rows joined by id.", "Covert, ToxicSpans and InContext configs are not authorized."],
  },
  TOXIGEN_ANNOTATED: {
    sourceId: "TOXIGEN_ANNOTATED", displayName: "ToxiGen annotated", publisher: "Microsoft / ToxiGen",
    authoritativeUrl: "https://huggingface.co/datasets/toxigen/toxigen-data", acquisitionMethod: "HF_REVISION", version: "2024-06-17",
    revision: "ea082a8973a287097b17973343576e0c8da8eb3b", configuration: ["annotated"], expectedArtifacts: toxigenArtifacts,
    availableSplits: ["train", "test"], languageCoverage: ["en"], contentOrigin: "MACHINE_GENERATED",
    annotationLicenseKey: "LICENSE.CDLA_PERMISSIVE_2_0", sourceTextLicenseKey: "LICENSE.CDLA_PERMISSIVE_2_0", accessTermsKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE",
    commercialTrainingAssessment: "APPROVED", redistributionAssessment: "APPROVED", sourceTextRightsNotes: "Synthetic data released under CDLA-Permissive-2.0.",
    stableRowIdentifierStrategy: "sha256(sourceId, revision, split, artifactId, source row ordinal)", diagnosticOnly: false, approvedForTraining: true,
    dataSensitivity: "PUBLIC_TEXT_REQUIRES_PII_REVIEW", citation: "Hartvigsen et al. (2022), ToxiGen",
    notes: ["Only annotated is authorized.", "The generated train, annotations and prompts configurations are excluded."],
  },
  MEASURING_HATE_SPEECH: {
    sourceId: "MEASURING_HATE_SPEECH", displayName: "Measuring Hate Speech", publisher: "UC Berkeley D-Lab",
    authoritativeUrl: "https://huggingface.co/datasets/ucberkeley-dlab/measuring-hate-speech", acquisitionMethod: "HF_REVISION", version: "2025-12-28",
    revision: "5468f6e118396646b02a2f691e771f6b6d9502ea", configuration: ["default"], expectedArtifacts: measuringHateSpeechArtifacts, availableSplits: ["train"], languageCoverage: ["en"],
    contentOrigin: "HUMAN_PUBLIC_COMMENT", annotationLicenseKey: "LICENSE.CC_BY_4_0", sourceTextLicenseKey: "LICENSE.CC_BY_4_0",
    accessTermsKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE", commercialTrainingAssessment: "APPROVED", redistributionAssessment: "APPROVED",
    sourceTextRightsNotes: "Publisher-controlled Hugging Face release is marked CC BY 4.0.",
    stableRowIdentifierStrategy: "annotation sha256(sourceId, revision, comment_id, annotator_id); content sha256(sourceId, revision, comment_id)",
    diagnosticOnly: false, approvedForTraining: true, dataSensitivity: "RESTRICTED_ANNOTATOR_METADATA",
    citation: "Kennedy et al. (2020); Sachdeva et al. (2022), Measuring Hate Speech",
    notes: ["Pinned default/train contains 135,556 annotation rows across 39,565 comments and 7,912 annotators.", "One source row is an annotation, not an independent content item.", "Annotator demographics belong only in restricted sidecars."],
  },
  HATEMOJI_BUILD: {
    sourceId: "HATEMOJI_BUILD", displayName: "HatemojiBuild", publisher: "Hannah Rose Kirk et al.",
    authoritativeUrl: "https://github.com/HannahKirk/Hatemoji", acquisitionMethod: "GIT_COMMIT", version: "2021",
    revision: "a626f63216158748d072e581efc00267031f4404", configuration: ["HatemojiBuild"], expectedArtifacts: hatemojiArtifacts,
    availableSplits: ["train", "validation", "test"], languageCoverage: ["en"], contentOrigin: "EXPERT_GENERATED",
    annotationLicenseKey: "LICENSE.CC_BY_4_0", sourceTextLicenseKey: "LICENSE.CC_BY_4_0", accessTermsKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE",
    commercialTrainingAssessment: "APPROVED", redistributionAssessment: "APPROVED", sourceTextRightsNotes: "Author-generated synthetic statements under CC BY 4.0.",
    stableRowIdentifierStrategy: "sha256(sourceId, pinned revision, native entry_id)", diagnosticOnly: false, approvedForTraining: true,
    dataSensitivity: "PUBLIC_TEXT_REQUIRES_PII_REVIEW", citation: "Kirk et al. (2021), Hatemoji",
    notes: ["Equivalent Hugging Face revision: 17509b6678c3206ce7bfa43107fdadf53f3d06f7.", "matched_text is relationship evidence and must not be emitted as a second row."],
  },
  MULTILINGUAL_HATECHECK: {
    sourceId: "MULTILINGUAL_HATECHECK", displayName: "Multilingual HateCheck", publisher: "Röttger et al. / Rewire",
    authoritativeUrl: "https://github.com/rewire-online/multilingual-hatecheck", acquisitionMethod: "GIT_COMMIT", version: "2022",
    revision: "a03f2caf2023a402d85064bda243e46d280408f0", configuration: ["final-cases"], expectedArtifacts: [],
    availableSplits: ["ANALYSIS_ONLY"], languageCoverage: ["ar", "nl", "fr", "de", "hi", "it", "zh", "pl", "pt", "es"],
    contentOrigin: "DIAGNOSTIC_TEMPLATE", annotationLicenseKey: "LICENSE.CC_BY_4_0", sourceTextLicenseKey: "LICENSE.CC_BY_4_0",
    accessTermsKey: "ACCESS.PUBLIC_AUTHORITATIVE_SOURCE", commercialTrainingAssessment: "PROHIBITED", redistributionAssessment: "APPROVED",
    sourceTextRightsNotes: "Registered only to enforce diagnostic separation.", stableRowIdentifierStrategy: "sha256(sourceId, revision, language file, mhc_case_id)",
    diagnosticOnly: true, approvedForTraining: false, dataSensitivity: "PUBLIC_TEXT_REQUIRES_PII_REVIEW",
    citation: "Röttger et al. (2022), Multilingual HateCheck", notes: ["Rows are not acquired by T6L-6E."],
  },
};

export const assertRegistries = (): void => {
  if (DATASET_SCHEMA_VERSION !== "STHN_TEXT_MODERATION_DATASET_SCHEMA_V1" || DATASET_POLICY_VERSION !== "STHN_TEXT_MODERATION_POLICY_V1") throw new Error("Frozen dataset authority mismatch");
  if (!SOURCE_REGISTRY_VERSION || !LICENSE_REGISTRY_VERSION) throw new Error("Registry version is required");
  for (const source of Object.values(sourceRegistry)) {
    for (const key of [source.annotationLicenseKey, source.sourceTextLicenseKey, source.accessTermsKey]) {
      if (!licenseRegistry[key]) throw new Error(`Missing license registry key ${key}`);
    }
    if (source.diagnosticOnly && source.approvedForTraining) throw new Error(`${source.sourceId} cannot be diagnostic and training-approved`);
    if (source.approvedForTraining && source.commercialTrainingAssessment !== "APPROVED") throw new Error(`${source.sourceId} lacks commercial approval`);
  }
};

export const requireTrainingSource = (sourceId: SourceId): SourceRegistryRecord & { sourceId: TrainingSourceId } => {
  const source = sourceRegistry[sourceId];
  if (!source || source.diagnosticOnly || !source.approvedForTraining || source.commercialTrainingAssessment !== "APPROVED") {
    throw new Error(`Source ${sourceId} is not approved for training ingestion`);
  }
  return source as SourceRegistryRecord & { sourceId: TrainingSourceId };
};

export const assertSplitAllowed = (sourceId: SourceId, split: string): void => {
  const source = sourceRegistry[sourceId];
  if (!source) throw new Error(`Unknown source ${sourceId}`);
  if ((source.diagnosticOnly || !source.approvedForTraining) && ["TRAIN", "VALIDATION", "INTERNAL_TEST"].includes(split)) {
    throw new Error(`Diagnostic or unapproved source ${sourceId} cannot enter ${split}`);
  }
  if (source.diagnosticOnly && split !== "ANALYSIS_ONLY") throw new Error(`Diagnostic source ${sourceId} must remain ANALYSIS_ONLY`);
};
