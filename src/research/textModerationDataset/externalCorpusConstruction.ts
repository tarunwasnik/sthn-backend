import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "./manifest";
import { DATASET_POLICY_VERSION, DATASET_SCHEMA_VERSION } from "./contracts";
import { EXTERNAL_DATASET_ROOT, assertExternalIntakePath } from "./externalDatasetIntake";

export const EXTERNAL_MAPPING_POLICY_VERSION = "T6L_8G_B_EXTERNAL_MAPPING_POLICY_V1";
export const EXTERNAL_CORPUS_CONSTRUCTION_VERSION = "T6L_8G_B_EXTERNAL_CORPUS_CONSTRUCTION_V1";
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const writeAtomic = (filename: string, value: unknown): void => { assertExternalIntakePath(filename); fs.mkdirSync(path.dirname(filename), { recursive: true }); const partial = `${filename}.${process.pid}.partial`; fs.writeFileSync(partial, canonicalJson(value)); fs.renameSync(partial, filename); };
const read = (filename: string): Record<string, unknown> => JSON.parse(fs.readFileSync(filename, "utf8")) as Record<string, unknown>;
const inventoryPath = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-final-inventory-v1.json");
const certificationPath = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-inventory-certification-a2r-v1.json");

export const externalMappingPolicy = (): Record<string, unknown> => ({
  policyVersion: EXTERNAL_MAPPING_POLICY_VERSION, sthnPolicyVersion: DATASET_POLICY_VERSION, datasetSchemaVersion: DATASET_SCHEMA_VERSION,
  upstream: { inventoryPath, inventorySha256: sha(fs.readFileSync(inventoryPath)), certificationPath, certificationSha256: sha(fs.readFileSync(certificationPath)) },
  admissionBoundarySemantics: "DATA_ADMISSION_ONLY_NOT_A_MODEL_DECISION_THRESHOLD",
  rules: [
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_CLEAN_ALLOW_V1", outcome: "STRONG_ALLOW", when: "all seven certified scores <= 0.05", binaryEligible: true, auxiliaryEligible: false },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_THREAT_BLOCK_V1", outcome: "STRONG_BLOCK", when: "threat >= 0.80", category: "THREAT_OR_VIOLENCE", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_SEXUAL_BLOCK_V1", outcome: "STRONG_BLOCK", when: "sexual_explicit >= 0.80", category: "SEXUAL", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_IDENTITY_BLOCK_V1", outcome: "STRONG_BLOCK", when: "identity_attack >= 0.80", category: "HATE", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_INSULT_BLOCK_V1", outcome: "STRONG_BLOCK", when: "insult >= 0.80", category: "ABUSIVE_OR_HARASSING", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_OBSCENE_BLOCK_V1", outcome: "STRONG_BLOCK", when: "obscene >= 0.80 and stronger category absent", category: "PROFANITY", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_GENERIC_BINARY_BLOCK_V1", outcome: "STRONG_BLOCK", when: "toxicity >= 0.90 and no category signal >= 0.80", category: null, binaryEligible: true, auxiliaryEligible: false },
    { sourceId: "GOOGLE_CIVIL_COMMENTS", ruleId: "CIVIL_AMBIGUOUS_EXCLUDE_V1", outcome: "AMBIGUOUS_EXCLUDE", when: "all remaining rows", binaryEligible: false, auxiliaryEligible: false },
    { sourceId: "TEXTDETOX_MULTILINGUAL_TOXICITY", ruleId: "TEXTDETOX_BINARY_V1", outcome: "STRONG_ALLOW_OR_BLOCK", when: "toxic is source-defined 0 or 1", binaryEligible: true, auxiliaryEligible: false },
    { sourceId: "PRISM_HINGLISH_HATE_SPEECH", ruleId: "PRISM_POSITIVE_HATE_V1", outcome: "STRONG_BLOCK", when: "canonical provided split label=1", category: "HATE", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "PRISM_HINGLISH_HATE_SPEECH", ruleId: "PRISM_NEGATIVE_EXCLUDE_V1", outcome: "AMBIGUOUS_EXCLUDE", when: "label=0", binaryEligible: false, auxiliaryEligible: false },
    { sourceId: "ETHOS_HATE_SPEECH", ruleId: "ETHOS_BINARY_POSITIVE_HATE_V1", outcome: "STRONG_BLOCK", when: "binary isHate >= 0.80", category: "HATE", binaryEligible: true, auxiliaryEligible: true },
    { sourceId: "ETHOS_HATE_SPEECH", ruleId: "ETHOS_REMAINDER_EXCLUDE_V1", outcome: "AMBIGUOUS_EXCLUDE", when: "all other ETHOS rows", binaryEligible: false, auxiliaryEligible: false },
    { sourceId: "POLYGLOT_HINDI_TOXICITY_QWEN", ruleId: "POLYGLOT_AUXILIARY_DISABLED_V1", outcome: "AUXILIARY_ONLY", binaryEligible: false, auxiliaryEligible: false },
    { sourceId: "DYNAHATE,HATECHECK,MULTILINGUAL_HATECHECK", ruleId: "DIAGNOSTIC_SEALED_V1", outcome: "DIAGNOSTIC_ONLY", binaryEligible: false, auxiliaryEligible: false },
  ],
  categoryPrecedence: ["THREAT_OR_VIOLENCE", "SEXUAL", "HATE", "ABUSIVE_OR_HARASSING", "PROFANITY", "OTHER_INAPPROPRIATE"],
  otherInappropriateExternalLabels: "FORBIDDEN", protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0,
});

export const externalCorpusConstructionContract = (mappingSha256: string): Record<string, unknown> => ({
  contractVersion: EXTERNAL_CORPUS_CONSTRUCTION_VERSION, mappingPolicySha256: mappingSha256, deduplication: { exactFingerprint: "SHA256_EXACT_UNICODE_TEXT", normalizedFingerprint: "EXISTING_TEXT_DUPLICATE_FINGERPRINT", semanticDeduplication: "FORBIDDEN", componentAtomicity: true, conflictingBinaryDecision: "EXCLUDE_COMPONENT", conflictingCategory: "MASK_AUXILIARY" },
  sourcePriority: ["EXISTING_STHN_HUMAN", "HUMAN_AGGREGATED_OR_CROWDSOURCED_EXTERNAL", "GENERIC_BINARY_EXTERNAL", "MODEL_GENERATED_AUXILIARY"], sourceCaps: { GOOGLE_CIVIL_COMMENTS: 30000, TEXTDETOX_MULTILINGUAL_TOXICITY: 24000, PRISM_HINGLISH_HATE_SPEECH: 12000, ETHOS_HATE_SPEECH: 8000, POLYGLOT_HINDI_TOXICITY_QWEN: 0 },
  languagePolicy: { primary: ["english", "hindi", "hinglish"], primaryPerLanguageCap: 8000, otherTextDetoxLanguageCap: 1000, sourceLevelLanguageAllowed: true, languageDetector: "FORBIDDEN" },
  binaryTargets: { allow: "NATURAL_AFTER_CAPS", block: "NATURAL_AFTER_CAPS", genericToxicBlockAuxiliary: "MASKED" }, categoryPolicy: { externalOtherInappropriate: 0, capPerExternalCategory: 8000 }, validation: { fraction: 0.1, seed: 2063609992, legacyValidation: "REFERENCE_ONLY", duplicateComponentsCannotCross: true },
  textPreservation: "EXACT_UNICODE_SOURCE_TEXT", pii: "NO_NEW_MANUAL_REVIEW_OR_AUTOMATIC_EXCLUSION", diagnosticsForbidden: ["DYNAHATE", "HATECHECK", "MULTILINGUAL_HATECHECK"], unavailableForbidden: ["JIGSAW_TOXIC_COMMENT_CHALLENGE", "CONSTRAINT_HINDI_HOSTILITY", "OLID_OFFENSEVAL", "SOCIAL_BIAS_FRAMES"], resourceDiagnostics: { authoritativeForEligibility: false }, protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0,
});

export const prepareExternalCorpusConstruction = (): Record<string, unknown> => {
  if (!fs.existsSync(inventoryPath) || !fs.existsSync(certificationPath)) throw new Error("Frozen A2R authorities are required"); const policy = externalMappingPolicy(); const policyPath = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-mapping-policy-v1.json"); writeAtomic(policyPath, policy); const policySha256 = sha(fs.readFileSync(policyPath)); const contract = externalCorpusConstructionContract(policySha256); const contractPath = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-corpus-construction-contract-v1.json"); writeAtomic(contractPath, contract); const preparation = { authority: "LOCAL_EXTERNAL_CORPUS_CONSTRUCTION_READY", policyPath, policySha256, policyPayloadDigest: digest(policy), contractPath, contractSha256: sha(fs.readFileSync(contractPath)), contractPayloadDigest: digest(contract), localCommand: "npm run build:text-moderation:external-corpus", protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, modelThresholdSelections: 0, resourceDiagnostics: { authoritativeForEligibility: false } }; const output = path.join(EXTERNAL_DATASET_ROOT, "external-corpus-construction-preparation-v1.json"); writeAtomic(output, preparation); return { preparationPath: output, preparationSha256: sha(fs.readFileSync(output)), preparationPayloadDigest: digest(preparation), ...preparation };
};
