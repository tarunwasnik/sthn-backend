import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PiiStatus } from "./contracts";
import { canonicalJson } from "./manifest";

export const TEXT_MODERATION_PII_POLICY_SCHEMA = "STHN_TEXT_MODERATION_PII_POLICY_AUTHORITY_V1" as const;
export const TEXT_MODERATION_PII_POLICY_VERSION = "TEXT_MODERATION_DATASET_PII_POLICY_V1" as const;
export const TEXT_MODERATION_PII_DETECTOR_VERSION = "HIGH_CONFIDENCE_PATTERN_SCREEN_V1" as const;
export const TEXT_MODERATION_PII_POLICY_FILENAME = "sthn-text-moderation-pii-policy-v1.json" as const;
export const TEXT_MODERATION_PII_POLICY_GENERATED_AT = "2026-09-15T00:00:00.000Z" as const;
export const TEXT_MODERATION_PII_POLICY_SHA256 = "a1a46fefad4633cb1716aa8a1503e220ab12018743f79b06cbffd53b38fbf169" as const;
export const TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST = "a24db6ff57e159f9420139356f0c0841ef95c98cc387e6a615821e6b1a403dfa" as const;

export const DATASET_PII_STATUSES = ["NONE", "REDACTED", "REQUIRES_REVIEW", "EXCLUDE"] as const satisfies readonly PiiStatus[];
export const DATASET_PII_FINDING_FAMILIES = [
  "DIRECT_CONTACT_IDENTIFIER", "NETWORK_IDENTIFIER", "GOVERNMENT_OR_HIGH_RISK_IDENTIFIER",
  "FINANCIAL_OR_ACCOUNT_IDENTIFIER", "PRECISE_ADDRESS_OR_LOCATION_IDENTIFIER", "PERSON_NAME_OR_PERSON_REFERENCE",
  "ONLINE_HANDLE_OR_USERNAME", "URL_OR_EXTERNAL_LINK", "ORGANIZATION_OR_PUBLIC_ENTITY_REFERENCE",
  "AMBIGUOUS_NUMERIC_OR_CONTEXTUAL_IDENTIFIER", "OTHER_CONTEXT_SENSITIVE_PII",
] as const;
export const AUTOMATIC_PII_FINDINGS_V1 = ["EMAIL_PATTERN", "PHONE_PATTERN_STRONG", "IPV4_PATTERN_VALID", "AMBIGUOUS_NUMERIC_PATTERN"] as const;
export type AutomaticPiiFindingV1 = typeof AUTOMATIC_PII_FINDINGS_V1[number];
export const HUMAN_REVIEW_ONLY_PII_CLASSES = [
  "GOVERNMENT_OR_HIGH_RISK_IDENTIFIER", "FINANCIAL_OR_ACCOUNT_IDENTIFIER", "PRECISE_ADDRESS_OR_LOCATION_IDENTIFIER",
  "PERSON_REFERENCE_WITH_PRIVATE_CONTEXT", "IPV6_OR_OTHER_NETWORK_IDENTIFIER", "INDIRECT_IDENTIFIER",
  "NOVEL_OR_CONTEXTUAL_OBFUSCATION", "OTHER_CONTEXT_SENSITIVE_PII",
] as const;
export const PII_EXCLUSION_REASON_CODES = ["CONFIRMED_HIGH_RISK_GOVERNMENT_IDENTIFIER", "CONFIRMED_FINANCIAL_OR_ACCOUNT_CREDENTIAL", "CONFIRMED_PRECISE_PRIVATE_CONTACT_BUNDLE", "OTHER_CONFIRMED_HIGH_RISK_PII"] as const;

type AutomaticStatus = "NONE" | "REQUIRES_REVIEW";
export interface SyntheticPiiPolicyResult { readonly detectorVersion: typeof TEXT_MODERATION_PII_DETECTOR_VERSION; readonly findingClasses: readonly AutomaticPiiFindingV1[]; readonly automaticStatus: AutomaticStatus; readonly requiresHumanPiiReview: boolean }

const normalizeForDetection = (text: string): string => text.normalize("NFKC");
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu;
const PHONE_CANDIDATE = /(?:^|[^\d])((?:\+\d{1,3}[ \-])?(?:\(\d{2,4}\)[ \-]?|\d{2,4}[ \-])\d{3,4}[ \-]\d{3,4})(?!\d)/gu;
const IPV4_CANDIDATE = /(?:^|[^\d])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/gu;
const LONG_DIGITS = /(?<!\d)\d{7,18}(?!\d)/gu;
const validIpv4 = (value: string): boolean => value.split(".").length === 4 && value.split(".").every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255 && (part === "0" || !part.startsWith("0")));
const digitCount = (value: string): number => value.replace(/\D/gu, "").length;

export const screenSyntheticTextUnderPiiPolicy = (text: string, detectorVersion: string = TEXT_MODERATION_PII_DETECTOR_VERSION): SyntheticPiiPolicyResult => {
  if (detectorVersion !== TEXT_MODERATION_PII_DETECTOR_VERSION) throw new Error(`Unsupported PII detector version: ${detectorVersion}`);
  const normalized = normalizeForDetection(text), found = new Set<AutomaticPiiFindingV1>();
  if ([...normalized.matchAll(EMAIL)].length) found.add("EMAIL_PATTERN");
  const phones = [...normalized.matchAll(PHONE_CANDIDATE)].map((match) => match[1]).filter((value) => digitCount(value) >= 10 && digitCount(value) <= 15);
  if (phones.length) found.add("PHONE_PATTERN_STRONG");
  if ([...normalized.matchAll(IPV4_CANDIDATE)].some((match) => validIpv4(match[1]))) found.add("IPV4_PATTERN_VALID");
  if ([...normalized.matchAll(LONG_DIGITS)].some((match) => !phones.some((phone) => phone.replace(/\D/gu, "") === match[0]))) found.add("AMBIGUOUS_NUMERIC_PATTERN");
  const findingClasses = AUTOMATIC_PII_FINDINGS_V1.filter((finding) => found.has(finding));
  return { detectorVersion: TEXT_MODERATION_PII_DETECTOR_VERSION, findingClasses, automaticStatus: findingClasses.length ? "REQUIRES_REVIEW" : "NONE", requiresHumanPiiReview: findingClasses.length > 0 };
};

export interface TextModerationPiiPolicyPayload {
  readonly schemaVersion: typeof TEXT_MODERATION_PII_POLICY_SCHEMA;
  readonly policyVersion: typeof TEXT_MODERATION_PII_POLICY_VERSION;
  readonly phase: "T6L-7I2A-P";
  readonly scope: Readonly<Record<string, unknown>>;
  readonly taxonomy: readonly PiiStatus[];
  readonly findingFamilies: typeof DATASET_PII_FINDING_FAMILIES;
  readonly supportedAutomaticFindings: typeof AUTOMATIC_PII_FINDINGS_V1;
  readonly unsupportedContextSensitiveClasses: typeof HUMAN_REVIEW_ONLY_PII_CLASSES;
  readonly semantics: Readonly<Record<PiiStatus, Readonly<Record<string, unknown>>>>;
  readonly subjectPolicies: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly detectorContract: Readonly<Record<string, unknown>>;
  readonly dispositionMatrix: readonly Readonly<Record<string, unknown>>[];
  readonly exclusionReasonCodes: typeof PII_EXCLUSION_REASON_CODES;
  readonly falsePositiveSafeguards: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly humanReviewFallback: Readonly<Record<string, unknown>>;
  readonly independence: Readonly<Record<string, boolean>>;
  readonly authorizationDecision: "AUTHORIZE_PII_SCREENING_POLICY_V1";
  readonly resumeDecision: "RESUME_T6L_7I2A_PII_SCREENING";
  readonly generatedAt: typeof TEXT_MODERATION_PII_POLICY_GENERATED_AT;
}
export type TextModerationPiiPolicyArtifact = TextModerationPiiPolicyPayload & { readonly policyPayloadDigest: string };

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const payloadDigest = (payload: TextModerationPiiPolicyPayload): string => sha(canonicalJson(payload));

export const createTextModerationPiiPolicy = (): TextModerationPiiPolicyArtifact => {
  const matrix = [
    { findingClass: "NO_SUPPORTED_FINDING", confidence: "BOUNDED_NEGATIVE", ambiguity: false, automaticStatus: "NONE", reviewRequirement: "NONE", exclusionRule: "NEVER_AUTOMATIC", redactionAllowed: false },
    { findingClass: "EMAIL_PATTERN", confidence: "HIGH_PATTERN_CONFIDENCE", ambiguity: false, automaticStatus: "REQUIRES_REVIEW", reviewRequirement: "HUMAN_PII_REVIEW", exclusionRule: "NEVER_AUTOMATIC", redactionAllowed: false },
    { findingClass: "PHONE_PATTERN_STRONG", confidence: "HIGH_PATTERN_CONFIDENCE", ambiguity: false, automaticStatus: "REQUIRES_REVIEW", reviewRequirement: "HUMAN_PII_REVIEW", exclusionRule: "NEVER_AUTOMATIC", redactionAllowed: false },
    { findingClass: "IPV4_PATTERN_VALID", confidence: "HIGH_PATTERN_CONFIDENCE", ambiguity: false, automaticStatus: "REQUIRES_REVIEW", reviewRequirement: "HUMAN_PII_REVIEW", exclusionRule: "NEVER_AUTOMATIC", redactionAllowed: false },
    { findingClass: "AMBIGUOUS_NUMERIC_PATTERN", confidence: "AMBIGUOUS", ambiguity: true, automaticStatus: "REQUIRES_REVIEW", reviewRequirement: "HUMAN_PII_REVIEW", exclusionRule: "NEVER_AUTOMATIC", redactionAllowed: false },
    { findingClass: "EXTERNALLY_SURFACED_CONTEXT_SENSITIVE_CLASS", confidence: "CONTEXT_REQUIRED", ambiguity: true, automaticStatus: "REQUIRES_REVIEW", reviewRequirement: "HUMAN_PII_REVIEW", exclusionRule: "HUMAN_CONFIRMATION_ONLY", redactionAllowed: false },
  ];
  const payload: TextModerationPiiPolicyPayload = {
    schemaVersion: TEXT_MODERATION_PII_POLICY_SCHEMA, policyVersion: TEXT_MODERATION_PII_POLICY_VERSION, phase: "T6L-7I2A-P",
    scope: { domain: "TEXT_MODERATION_DATASET_GOVERNANCE", contentOrigin: "PUBLIC_TEXT", detectorClaim: "BOUNDED_HIGH_CONFIDENCE_PATTERN_SCREEN_NOT_COMPLETE_PII_DETECTION", candidateScreeningPerformed: false, appliesProspectivelyFromPhase: "T6L-7I2A" },
    taxonomy: DATASET_PII_STATUSES, findingFamilies: DATASET_PII_FINDING_FAMILIES, supportedAutomaticFindings: AUTOMATIC_PII_FINDINGS_V1, unsupportedContextSensitiveClasses: HUMAN_REVIEW_ONLY_PII_CLASSES,
    semantics: {
      NONE: { meaning: "No finding within the complete set of classes this V1 policy requires automatic or human disposition for under the authorized bounded screen.", automaticAssignmentAllowed: true, prerequisites: ["exact source text screened", "authorized detector version", "zero supported automatic findings", "no externally surfaced context-sensitive concern"], residualRiskAccepted: true, completenessClaim: false },
      REDACTED: { meaning: "A separately authorized human-approved transformation preserved original and transformed digests plus lineage.", automaticAssignmentAllowed: false, automaticRedaction: "DISABLED", futureAuthorityRequired: true },
      REQUIRES_REVIEW: { meaning: "A supported positive, ambiguity signal, or externally surfaced context-sensitive concern requires privacy-only human disposition.", progressionToModerationAllowed: false, failClosed: true },
      EXCLUDE: { meaning: "A human PII authority confirmed prohibited high-risk identifying content under a bounded exclusion reason.", automaticAssignmentAllowed: false, moderationReviewAllowed: false, requiresHumanConfirmation: true },
    },
    subjectPolicies: {
      names: { ordinaryOrPublicPersonReference: "NOT_PII_BY_ITSELF", privateIdentificationContext: "REQUIRES_REVIEW_IF_SURFACED", automaticNerAuthorized: false },
      addressAndLocation: { countryCityStateOrPlaceReference: "NOT_PII_BY_ITSELF", precisePrivateAddress: "HUMAN_REVIEW_ONLY", automaticPreciseAddressDetectionAuthorized: false },
      urls: { standaloneUrl: "NOT_PII_BY_ITSELF", embeddedSupportedIdentifier: "SUPPORTED_IDENTIFIER_RULE_CONTROLS", privateContext: "REQUIRES_REVIEW_IF_SURFACED" },
      handles: { standaloneHandle: "NOT_PII_BY_ITSELF", privateContactContext: "REQUIRES_REVIEW_IF_SURFACED", chatContactIntentHelperIsAuthority: false },
      organizations: { ordinaryOrganizationOrPublicEntity: "NOT_PII_BY_ITSELF", privateIdentificationContext: "REQUIRES_REVIEW_IF_SURFACED" },
      ambiguousNumbers: { yearsAndShortNumbers: "NOT_BLINDLY_CLASSIFIED", contiguousSevenToEighteenDigits: "AMBIGUOUS_NUMERIC_PATTERN", strongFormattedPhone: "PHONE_PATTERN_STRONG", outcome: "REQUIRES_REVIEW" },
    },
    detectorContract: { detectorVersion: TEXT_MODERATION_PII_DETECTOR_VERSION, exactTextRequired: true, normalization: "UNICODE_NFKC_FOR_DETECTION_ONLY", storedTextMutation: false, precedence: AUTOMATIC_PII_FINDINGS_V1, patterns: { EMAIL_PATTERN: "ASCII conventional local@domain.tld; TLD 2-63 letters", PHONE_PATTERN_STRONG: "10-15 digits with strong formatting such as country prefix, spaces, hyphens, or parentheses", IPV4_PATTERN_VALID: "four decimal octets each 0-255; no leading zero except zero", AMBIGUOUS_NUMERIC_PATTERN: "standalone contiguous 7-18 digits not already consumed as a strong phone" }, outputStoresRawMatch: false, unsupportedVersionFailsClosed: true, automaticExclusion: false, automaticRedaction: false },
    dispositionMatrix: matrix, exclusionReasonCodes: PII_EXCLUSION_REASON_CODES,
    falsePositiveSafeguards: ["A four-digit year such as 2026 is not a phone or account finding.", "Phone detection requires 10-15 digits and strong formatting; a plain long number is ambiguity-only.", "IPv4 octets must be in range and leading-zero safe.", "Ordinary city, country, organization, public-person, URL, and handle references are not PII by themselves.", "A detected pattern triggers review rather than automatic exclusion."],
    knownLimitations: ["No person-name NER.", "No automatic precise-address inference.", "No IPv6 detector.", "No comprehensive government, passport, national-ID, bank, payment, or account-format detector.", "No guarantee for novel obfuscation or indirect/contextual identification.", "A NONE result is bounded policy clearance, not proof that all conceivable private information is absent."],
    humanReviewFallback: { phaseMustBeSeparatelyAuthorized: true, role: "HUMAN_PII_REVIEWER", allowedOutputs: ["NONE", "EXCLUDE", "REQUIRES_REVIEW"], forbiddenOutputs: ["ALLOW", "BLOCK", "MODERATION_CATEGORY"], unresolvedRemains: "REQUIRES_REVIEW", redactionRequiresSeparateTransformationAuthority: true },
    independence: { consumesSourceModerationMeasurements: false, consumesProposalStratum: false, assignsModerationDecision: false, assignsModerationCategory: false, screensRealCandidatesInThisPhase: false, accessesInternalTest: false, accessesFrozen140: false, runsModelInference: false, performsTraining: false },
    authorizationDecision: "AUTHORIZE_PII_SCREENING_POLICY_V1", resumeDecision: "RESUME_T6L_7I2A_PII_SCREENING", generatedAt: TEXT_MODERATION_PII_POLICY_GENERATED_AT,
  };
  const artifact = { ...payload, policyPayloadDigest: payloadDigest(payload) }; validateTextModerationPiiPolicy(artifact); return artifact;
};

export const validateTextModerationPiiPolicy = (artifact: TextModerationPiiPolicyArtifact): void => {
  const { policyPayloadDigest: actual, ...payload } = artifact;
  if (artifact.schemaVersion !== TEXT_MODERATION_PII_POLICY_SCHEMA || artifact.policyVersion !== TEXT_MODERATION_PII_POLICY_VERSION || artifact.phase !== "T6L-7I2A-P" || actual !== payloadDigest(payload)) throw new Error("Invalid PII policy identity or payload digest");
  if (canonicalJson(artifact.taxonomy) !== canonicalJson(DATASET_PII_STATUSES) || canonicalJson(artifact.supportedAutomaticFindings) !== canonicalJson(AUTOMATIC_PII_FINDINGS_V1) || artifact.detectorContract.detectorVersion !== TEXT_MODERATION_PII_DETECTOR_VERSION) throw new Error("PII policy taxonomy or detector drift");
  if (artifact.semantics.NONE.automaticAssignmentAllowed !== true || artifact.semantics.REDACTED.automaticAssignmentAllowed !== false || artifact.semantics.EXCLUDE.automaticAssignmentAllowed !== false || artifact.detectorContract.automaticRedaction !== false || artifact.detectorContract.automaticExclusion !== false) throw new Error("PII disposition policy drift");
  const required = ["NO_SUPPORTED_FINDING", ...AUTOMATIC_PII_FINDINGS_V1, "EXTERNALLY_SURFACED_CONTEXT_SENSITIVE_CLASS"];
  if (artifact.dispositionMatrix.length !== required.length || required.some((finding) => artifact.dispositionMatrix.filter((row) => row.findingClass === finding).length !== 1)) throw new Error("Incomplete PII disposition matrix");
  if (Object.values(artifact.independence).some(Boolean) || artifact.authorizationDecision !== "AUTHORIZE_PII_SCREENING_POLICY_V1" || artifact.resumeDecision !== "RESUME_T6L_7I2A_PII_SCREENING") throw new Error("PII policy boundary violation");
};

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export const publishTextModerationPiiPolicy = (artifact: TextModerationPiiPolicyArtifact, targetPath: string, publish: AtomicPublisher = fs.linkSync): { artifactPath: string; artifactSha256: string } => {
  validateTextModerationPiiPolicy(artifact); if (fs.existsSync(targetPath)) throw new Error("PII policy authority exists; overwrite refused"); fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const serialized = canonicalJson(artifact), temporaryPath = `${targetPath}.${process.pid}-${crypto.randomBytes(8).toString("hex")}.partial`;
  try { fs.writeFileSync(temporaryPath, serialized, { flag: "wx" }); publish(temporaryPath, targetPath); if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, "utf8") !== serialized) throw new Error("PII policy publication incomplete"); return { artifactPath: targetPath, artifactSha256: sha(Buffer.from(serialized, "utf8")) }; }
  catch (error) { if (fs.existsSync(targetPath) && fs.readFileSync(targetPath, "utf8") === serialized) fs.rmSync(targetPath, { force: true }); throw error; }
  finally { fs.rmSync(temporaryPath, { force: true }); }
};
