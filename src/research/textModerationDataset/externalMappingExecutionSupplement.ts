import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "./manifest";
import { EXTERNAL_DATASET_ROOT } from "./externalDatasetIntake";

export const EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_VERSION = "T6L_8G_B_EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_V1" as const;
export const SUPPLEMENT_FILENAME = "external-dataset-mapping-execution-supplement-v1.json" as const;
export const SUPPLEMENT_CERTIFICATION_FILENAME = "external-dataset-mapping-execution-supplement-certification-v1.json" as const;
export const EXECUTION_READINESS_FILENAME = "external-local-corpus-execution-readiness-v2.json" as const;
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const root = EXTERNAL_DATASET_ROOT;
export const supplementPath = path.join(root, SUPPLEMENT_FILENAME);
export const supplementCertificationPath = path.join(root, SUPPLEMENT_CERTIFICATION_FILENAME);
export const executionReadinessPath = path.join(root, EXECUTION_READINESS_FILENAME);
export const frozenAuthorities = {
  mappingPolicySha256: "d1e8d3d2a9de714260bcae9ed1553199186cd3c19491030f5424059de2c135ae",
  constructionContractSha256: "a12eb93c80f150a7f9d9b98cbf858d8ecbf6c179542b87da93242b1aa8b2ada8",
  preparationSha256: "ebd49643f2ba6500f29c27d6a390c43ffa5160d2bbb92fecbec27a44d05cd115",
  inventorySha256: "7e7335dbaf1d04259a72ec2e0cbb66e83e682755f0894560994c9fa902dd1b15",
  a2rCertificationSha256: "8b32123e42238b3bc47dab14c8c1684cc6621247494a3a9fbf3987e0ce4f7f2f",
} as const;
const file = (name: string): string => path.join(root, name);
const exact = (name: string, expected: string): void => { if (sha(fs.readFileSync(file(name))) !== expected) throw new Error(`T6L-8G-B frozen authority mismatch: ${name}`); };

export const executionSupplement = (): Record<string, unknown> => ({
  supplementVersion: EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_VERSION,
  status: "EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_CERTIFIED",
  subordinateTo: frozenAuthorities,
  protectedSourceAccess: false,
  executionDefaults: { ambiguity: "AMBIGUOUS_EXCLUDE", malformed: "EXCLUDE", text: "REQUIRED_NON_EMPTY_STRING", noInference: true },
  deduplication: { exact: { algorithm: "SHA-256", input: "EXACT_UNICODE_SOURCE_TEXT" }, normalized: { implementation: "src/research/textModerationDataset/identity.ts#textDuplicateFingerprint", version: "STHN_TEXT_DUPLICATE_NORMALIZATION_NFKC_LOWER_WHITESPACE_V1", algorithm: "SHA-256" }, semantic: "FORBIDDEN" },
  existingSthnTrain: { loader: "src/research/textModerationDataset/mhsTrainingReadyDataset.ts#loadMhsV2TrainingRows", artifact: "MEASURING_HATE_SPEECH/materialized/mhs-train-v2.jsonl", sha256: "fa9eaeb3fa519ded246bffda1fb57902ca2fcae4c64fb10968d430fab4a4bf74", payloadDigest: "f2c0e863db5169bf3989b3cdf72e2e71efdb71da982540bbfdebd8dc560f03ff", schema: "STHN_TEXT_MODERATION_MHS_MATERIALIZED_RECORD_V2", textField: "text", targetField: "target", categoryField: "primaryCategory", membershipDigest: "6bc66f7d0fdb28d7213c84a0c0dc3be6f607f6c6dc7400ac8e3e84497bdbad61", count: 200, allow: 110, block: 90 },
  sources: {
    GOOGLE_CIVIL_COMMENTS: { artifacts: ["data_train-00000-of-00002.parquet", "data_train-00001-of-00002.parquet", "data_validation-00000-of-00001.parquet", "data_test-00000-of-00001.parquet"], textField: "text", language: "english", requiredFiniteScores: ["toxicity", "severe_toxicity", "obscene", "threat", "insult", "identity_attack", "sexual_explicit"], allow: { all: "LTE", value: 0.05 }, blocks: [{ ruleId: "CIVIL_THREAT_BLOCK_V1", field: "threat", op: "GTE", value: 0.80, category: "THREAT_OR_VIOLENCE" }, { ruleId: "CIVIL_SEXUAL_BLOCK_V1", field: "sexual_explicit", op: "GTE", value: 0.80, category: "SEXUAL" }, { ruleId: "CIVIL_IDENTITY_BLOCK_V1", field: "identity_attack", op: "GTE", value: 0.80, category: "HATE" }, { ruleId: "CIVIL_INSULT_BLOCK_V1", field: "insult", op: "GTE", value: 0.80, category: "ABUSIVE_OR_HARASSING" }, { ruleId: "CIVIL_OBSCENE_BLOCK_V1", field: "obscene", op: "GTE", value: 0.80, category: "PROFANITY", requiresNoStrongerSignal: true }, { ruleId: "CIVIL_GENERIC_BINARY_BLOCK_V1", field: "toxicity", op: "GTE", value: 0.90, category: null, requiresNoCategorySignal: true }], precedence: ["THREAT_OR_VIOLENCE", "SEXUAL", "HATE", "ABUSIVE_OR_HARASSING", "PROFANITY", "OTHER_INAPPROPRIATE"] },
    TEXTDETOX_MULTILINGUAL_TOXICITY: { artifacts: ["am", "ar", "de", "en", "es", "fr", "he", "hi", "hin", "it", "ja", "ru", "tt", "uk", "zh"].map((language) => ({ artifact: `data_${language}-00000-of-00001.parquet`, language: ({ en: "english", hi: "hindi", hin: "hinglish" } as Record<string, string>)[language] ?? language })), textField: "text", labelField: "toxic", allowedLabels: [0, 1], labels: { 0: { decision: "ALLOW", auxiliary: "MASKED" }, 1: { decision: "BLOCK", auxiliary: "MASKED" } } },
    PRISM_HINGLISH_HATE_SPEECH: { canonicalView: "SOURCE_PROVIDED_LABELED_SPLITS", artifacts: ["data_train.csv", "data_val.csv", "data_test.csv"], excludedAlternativeViews: [{ artifact: "data_prism_cleaned.csv", reason: "OVERLAPPING_SOURCE_REPRESENTATION" }], textField: "text", labelField: "label", languageField: "lang", labels: { 1: { decision: "BLOCK", category: "HATE" }, 0: { decision: "AMBIGUOUS_EXCLUDE" } } },
    ETHOS_HATE_SPEECH: { archive: "ETHOS_HATE_SPEECH-705258e118ce9611ebbd5ab2a4841b0066547293.zip", canonicalVariant: "BINARY", memberPath: "Ethos-Hate-Speech-Dataset-705258e118ce9611ebbd5ab2a4841b0066547293/ethos/ethos_data/Ethos_Dataset_Binary.csv", memberSha256: "0cd0050c2592afcb5eca5876df485ca15cda9d7d16fe32c269857260fd10d96c", textField: "comment", labelField: "isHate", positive: { op: "GTE", value: 0.80, decision: "BLOCK", category: "HATE" }, excludedAlternativeViews: [{ memberPath: "Ethos-Hate-Speech-Dataset-705258e118ce9611ebbd5ab2a4841b0066547293/ethos/ethos_data/Ethos_Dataset_Multi_Label.csv", reason: "OVERLAPPING_SOURCE_REPRESENTATION" }] },
  },
  refused: { diagnostic: ["DYNAHATE", "HATECHECK", "MULTILINGUAL_HATECHECK"], unavailable: ["JIGSAW_TOXIC_COMMENT_CHALLENGE", "CONSTRAINT_HINDI_HOSTILITY", "OLID_OFFENSEVAL", "SOCIAL_BIAS_FRAMES"], disabled: ["POLYGLOT_HINDI_TOXICITY_QWEN"], protected: ["INTERNAL_TEST", "STHN_TEXT_MODERATION_FIXTURES_V1R"] },
  resourceDiagnostics: { authoritativeForEligibility: false }, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0,
});

export const validateExecutionSupplement = (artifact: Record<string, unknown> = executionSupplement()): void => {
  exact("external-dataset-mapping-policy-v1.json", frozenAuthorities.mappingPolicySha256); exact("external-dataset-corpus-construction-contract-v1.json", frozenAuthorities.constructionContractSha256); exact("external-corpus-construction-preparation-v1.json", frozenAuthorities.preparationSha256); exact("external-dataset-final-inventory-v1.json", frozenAuthorities.inventorySha256); exact("external-dataset-inventory-certification-a2r-v1.json", frozenAuthorities.a2rCertificationSha256);
  if (artifact.supplementVersion !== EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_VERSION || artifact.protectedSourceAccess !== false || artifact.modelLoads !== 0 || artifact.forwardPasses !== 0 || artifact.trainingRuns !== 0 || artifact.modelThresholdSelections !== 0) throw new Error("Invalid execution supplement safety boundary");
  const serialized = canonicalJson(artifact); if (serialized.includes("INTERNAL_TEST") && !serialized.includes('"protected"')) throw new Error("Protected source binding failure");
};
export const writeExecutionSupplement = (): { path: string; sha256: string; payloadDigest: string; certificationPath: string; certificationSha256: string; readinessPath: string; readinessSha256: string } => {
  const artifact = executionSupplement(); validateExecutionSupplement(artifact); const text = canonicalJson(artifact); const publish = (target: string, value: string): void => { if (fs.existsSync(target)) { if (fs.readFileSync(target, "utf8") !== value) throw new Error(`Immutable execution authority already differs: ${path.basename(target)}`); return; } const temporary = `${target}.${process.pid}.partial`; fs.writeFileSync(temporary, value, { flag: "wx" }); fs.renameSync(temporary, target); }; publish(supplementPath, text); const supplementSha256 = sha(Buffer.from(text)); const certificate = { status: "EXTERNAL_MAPPING_EXECUTION_SUPPLEMENT_CERTIFIED", supplementPath, supplementSha256, supplementPayloadDigest: digest(artifact), subordinateTo: frozenAuthorities, existingSthnTrain: (artifact.existingSthnTrain as Record<string, unknown>), sourceSelections: artifact.sources, ambiguity: "AMBIGUOUS_EXCLUDE", malformed: "EXCLUDE", protectedSourceAccess: false, resourceDiagnostics: { authoritativeForEligibility: false }, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0 }; const certText = canonicalJson(certificate); publish(supplementCertificationPath, certText); const runnerPath = path.resolve(process.cwd(), "src", "research", "textModerationDataset", "externalCorpusExecution.ts"); const readiness = { status: "LOCAL_EXTERNAL_CORPUS_EXECUTION_READY", command: "npm run construct:text-moderation:external-corpus", runnerPath, runnerSha256: sha(fs.readFileSync(runnerPath)), supplementSha256, certificationSha256: sha(Buffer.from(certText)), stages: ["REAL_SOURCE_PARSING", "AUTHORITY_MAPPING", "FILTERING", "DEDUPLICATION", "SOURCE_AND_LANGUAGE_SAMPLING", "TRAIN_VALIDATION_ASSIGNMENT", "ATOMIC_MATERIALIZATION", "CERTIFICATION"], protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0, resourceDiagnostics: { authoritativeForEligibility: false } }; const readinessText = canonicalJson(readiness); publish(executionReadinessPath, readinessText); return { path: supplementPath, sha256: supplementSha256, payloadDigest: digest(artifact), certificationPath: supplementCertificationPath, certificationSha256: sha(Buffer.from(certText)), readinessPath: executionReadinessPath, readinessSha256: sha(Buffer.from(readinessText)) };
};
