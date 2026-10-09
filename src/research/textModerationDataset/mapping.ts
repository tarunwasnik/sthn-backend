import { OriginalLabels, ProvenanceStagingRow, SourceId, TrainingSourceId } from "./contracts";
import { requireTrainingSource } from "./registries";

export const PUBLIC_MAPPING_VERSION = "STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1" as const;
export const PUBLIC_MAPPING_VERSION_V1R = "STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R" as const;
export const PUBLIC_MAPPING_VERSION_V1R2 = "STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2" as const;
export type PublicMappingVersion = typeof PUBLIC_MAPPING_VERSION | typeof PUBLIC_MAPPING_VERSION_V1R | typeof PUBLIC_MAPPING_VERSION_V1R2;
export type MappingOutcome = "ALLOW" | "BLOCK" | "NEEDS_REVIEW";
export type MappingConfidence = "HIGH" | "MEDIUM" | "LOW";
export type SthnCategory = "PROFANITY" | "SEXUAL" | "ABUSIVE_OR_HARASSING" | "HATE" | "THREAT_OR_VIOLENCE" | "OTHER_INAPPROPRIATE";
export type CategorySupport = "DIRECTLY_SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED";
export type MappingReasonCode = "HIGH_CONFIDENCE_HATE_THREAT" | "HIGH_CONFIDENCE_DEHUMANIZING_HATE" | "HIGH_CONFIDENCE_ANNOTATED_HATE" | "AUDITED_NON_PROTECTED_THREAT" | "AUDIT_REQUIRES_HUMAN_REVIEW" | "CERTIFICATION_INSUFFICIENT_SOURCE_SUPPORT" | "SOURCE_EVIDENCE_INSUFFICIENT";
export type ConditionOperator = "EQ" | "NEQ" | "IN" | "GTE" | "LTE";

export interface MappingCondition { readonly field: string; readonly operator: ConditionOperator; readonly value: string | number | readonly string[]; }
export interface PublicMappingRule {
  readonly mappingVersion: PublicMappingVersion;
  readonly sourceId: TrainingSourceId;
  readonly ruleId: string;
  readonly sourceCondition: readonly MappingCondition[];
  readonly mappedDecision: MappingOutcome;
  readonly mappedPrimaryCategory: SthnCategory | null;
  readonly mappedSecondaryCategories: readonly SthnCategory[];
  readonly mappingConfidence: MappingConfidence;
  readonly reviewRequired: boolean;
  readonly reasonCode: MappingReasonCode;
  readonly notes: string;
}
export interface MappingPreviewResult {
  readonly mappingVersion: PublicMappingVersion;
  readonly sourceId: TrainingSourceId;
  readonly total: number;
  readonly wouldAllow: number;
  readonly wouldBlock: number;
  readonly wouldNeedReview: number;
  readonly categoryCounts: Readonly<Record<string, number>>;
  readonly ruleCounts: Readonly<Record<string, number>>;
}

export const categorySupport: Readonly<Record<TrainingSourceId, Readonly<Record<SthnCategory, CategorySupport>>>> = {
  HATEMOJI_BUILD: { PROFANITY: "NOT_SUPPORTED", SEXUAL: "NOT_SUPPORTED", ABUSIVE_OR_HARASSING: "PARTIALLY_SUPPORTED", HATE: "DIRECTLY_SUPPORTED", THREAT_OR_VIOLENCE: "PARTIALLY_SUPPORTED", OTHER_INAPPROPRIATE: "NOT_SUPPORTED" },
  TOXIGEN_ANNOTATED: { PROFANITY: "NOT_SUPPORTED", SEXUAL: "PARTIALLY_SUPPORTED", ABUSIVE_OR_HARASSING: "PARTIALLY_SUPPORTED", HATE: "DIRECTLY_SUPPORTED", THREAT_OR_VIOLENCE: "NOT_SUPPORTED", OTHER_INAPPROPRIATE: "NOT_SUPPORTED" },
  CIVIL_COMMENTS_1_2_4: { PROFANITY: "PARTIALLY_SUPPORTED", SEXUAL: "PARTIALLY_SUPPORTED", ABUSIVE_OR_HARASSING: "PARTIALLY_SUPPORTED", HATE: "PARTIALLY_SUPPORTED", THREAT_OR_VIOLENCE: "PARTIALLY_SUPPORTED", OTHER_INAPPROPRIATE: "NOT_SUPPORTED" },
  MEASURING_HATE_SPEECH: { PROFANITY: "NOT_SUPPORTED", SEXUAL: "NOT_SUPPORTED", ABUSIVE_OR_HARASSING: "PARTIALLY_SUPPORTED", HATE: "DIRECTLY_SUPPORTED", THREAT_OR_VIOLENCE: "PARTIALLY_SUPPORTED", OTHER_INAPPROPRIATE: "NOT_SUPPORTED" },
};

const rule = (sourceId: TrainingSourceId, ruleId: string, sourceCondition: readonly MappingCondition[], mappedDecision: MappingOutcome, mappedPrimaryCategory: SthnCategory | null, mappedSecondaryCategories: readonly SthnCategory[], mappingConfidence: MappingConfidence, reasonCode: MappingReasonCode, notes: string, mappingVersion: PublicMappingVersion = PUBLIC_MAPPING_VERSION): PublicMappingRule => ({
  mappingVersion, sourceId, ruleId, sourceCondition, mappedDecision, mappedPrimaryCategory, mappedSecondaryCategories,
  mappingConfidence, reviewRequired: mappedDecision === "NEEDS_REVIEW", reasonCode, notes,
});

export const publicMappingRulesV1: readonly PublicMappingRule[] = [
  rule("HATEMOJI_BUILD", "HATEMOJI_HATE_THREAT_V1", [{ field: "label_gold", operator: "EQ", value: "1" }, { field: "type", operator: "EQ", value: "threateninglanguage" }, { field: "target", operator: "NEQ", value: "['none']" }], "BLOCK", "HATE", ["THREAT_OR_VIOLENCE"], "HIGH", "HIGH_CONFIDENCE_HATE_THREAT", "Source-confirmed hateful threat against a Hatemoji target; target taxonomy still receives mapping-audit sampling."),
  rule("HATEMOJI_BUILD", "HATEMOJI_DEHUMANIZING_HATE_V1", [{ field: "label_gold", operator: "EQ", value: "1" }, { field: "type", operator: "EQ", value: "dehumanizinglanguage" }, { field: "target", operator: "NEQ", value: "['none']" }], "BLOCK", "HATE", [], "HIGH", "HIGH_CONFIDENCE_DEHUMANIZING_HATE", "Source-confirmed dehumanizing hate; other Hatemoji hate types remain review-only."),
  rule("HATEMOJI_BUILD", "HATEMOJI_REVIEW_FALLBACK_V1", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "A hate-only source cannot establish that counterexamples are safe across every STHN category."),
  rule("TOXIGEN_ANNOTATED", "TOXIGEN_STRONG_HATE_V1", [{ field: "label", operator: "EQ", value: "hate" }, { field: "toxicity_human", operator: "GTE", value: 4 }, { field: "intent", operator: "GTE", value: 4 }], "BLOCK", "HATE", [], "HIGH", "HIGH_CONFIDENCE_ANNOTATED_HATE", "The source uses a 1-5 toxicity scale; >=4 is a deliberately stricter STHN high-confidence preview band, not a claimed source threshold."),
  rule("TOXIGEN_ANNOTATED", "TOXIGEN_REVIEW_FALLBACK_V1", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Neutral/source-hate labels and incomplete test metadata do not prove broad STHN ALLOW/BLOCK status."),
  rule("CIVIL_COMMENTS_1_2_4", "CIVIL_REVIEW_FALLBACK_V1", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Fractional crowd-label bands require mapping-audit approval before automatic use."),
  rule("MEASURING_HATE_SPEECH", "MHS_REVIEW_FALLBACK_V1", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Content-level Rasch aggregation and disagreement bands require mapping-audit approval."),
];

// V1 is retained above as immutable mapping history. V1R is the bounded revision supported by the T6L-6G human audit.
export const publicMappingRulesV1R: readonly PublicMappingRule[] = [
  rule("HATEMOJI_BUILD", "HATEMOJI_NON_PROTECTED_THREAT_V1R", [{ field: "label_gold", operator: "EQ", value: "1" }, { field: "type", operator: "EQ", value: "threateninglanguage" }, { field: "target", operator: "EQ", value: "['wc']" }], "BLOCK", "THREAT_OR_VIOLENCE", [], "HIGH", "AUDITED_NON_PROTECTED_THREAT", "Working-class-targeted threats remain threats but do not receive a protected-identity HATE category.", PUBLIC_MAPPING_VERSION_V1R),
  rule("HATEMOJI_BUILD", "HATEMOJI_HATE_THREAT_V1R", [{ field: "label_gold", operator: "EQ", value: "1" }, { field: "type", operator: "EQ", value: "threateninglanguage" }, { field: "target", operator: "NEQ", value: "['none']" }, { field: "target", operator: "NEQ", value: "['wc']" }], "BLOCK", "THREAT_OR_VIOLENCE", ["HATE"], "HIGH", "HIGH_CONFIDENCE_HATE_THREAT", "Audit-corrected category precedence: literal threat primary, protected-identity hate secondary.", PUBLIC_MAPPING_VERSION_V1R),
  rule("HATEMOJI_BUILD", "HATEMOJI_DEHUMANIZING_HATE_V1R", [{ field: "label_gold", operator: "EQ", value: "1" }, { field: "type", operator: "EQ", value: "dehumanizinglanguage" }, { field: "target", operator: "NEQ", value: "['none']" }, { field: "target", operator: "NEQ", value: "['wc']" }], "BLOCK", "HATE", [], "HIGH", "HIGH_CONFIDENCE_DEHUMANIZING_HATE", "Audit-confirmed dehumanizing hate, narrowed to exclude the non-protected working-class target.", PUBLIC_MAPPING_VERSION_V1R),
  rule("HATEMOJI_BUILD", "HATEMOJI_REVIEW_FALLBACK_V1R", [], "NEEDS_REVIEW", null, [], "LOW", "AUDIT_REQUIRES_HUMAN_REVIEW", "All remaining Hatemoji rows require human adjudication; no automatic ALLOW is inferred.", PUBLIC_MAPPING_VERSION_V1R),
  rule("TOXIGEN_ANNOTATED", "TOXIGEN_REVIEW_FALLBACK_V1R", [], "NEEDS_REVIEW", null, [], "LOW", "AUDIT_REQUIRES_HUMAN_REVIEW", "The audited high-score band contained contextual, target, category, and synthetic-artifact mismatches, so V1R makes no automatic ToxiGen decision.", PUBLIC_MAPPING_VERSION_V1R),
  rule("CIVIL_COMMENTS_1_2_4", "CIVIL_REVIEW_FALLBACK_V1R", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Source remains blocked and unaudited.", PUBLIC_MAPPING_VERSION_V1R),
  rule("MEASURING_HATE_SPEECH", "MHS_REVIEW_FALLBACK_V1R", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Source remains blocked and unaudited.", PUBLIC_MAPPING_VERSION_V1R),
];

export const publicMappingRulesV1R2: readonly PublicMappingRule[] = [
  rule("HATEMOJI_BUILD", "HATEMOJI_CERTIFICATION_REVIEW_FALLBACK_V1R2", [], "NEEDS_REVIEW", null, [], "LOW", "CERTIFICATION_INSUFFICIENT_SOURCE_SUPPORT", "All V1R automatic concepts failed the minimum independent certification support requirement; contextual false blocks and category mismatches were also observed.", PUBLIC_MAPPING_VERSION_V1R2),
  rule("TOXIGEN_ANNOTATED", "TOXIGEN_REVIEW_FALLBACK_V1R2", [], "NEEDS_REVIEW", null, [], "LOW", "AUDIT_REQUIRES_HUMAN_REVIEW", "T6L-6G rejected automatic ToxiGen mapping.", PUBLIC_MAPPING_VERSION_V1R2),
  rule("CIVIL_COMMENTS_1_2_4", "CIVIL_REVIEW_FALLBACK_V1R2", [], "NEEDS_REVIEW", null, [], "LOW", "SOURCE_EVIDENCE_INSUFFICIENT", "Source remains access-blocked and unaudited.", PUBLIC_MAPPING_VERSION_V1R2),
  rule("MEASURING_HATE_SPEECH", "MHS_REVIEW_FALLBACK_V1R2", [], "NEEDS_REVIEW", null, [], "LOW", "AUDIT_REQUIRES_HUMAN_REVIEW", "Acquired provenance-only; publisher measurements are not STHN labels and require a future mapping audit.", PUBLIC_MAPPING_VERSION_V1R2),
];

export const publicMappingRules: readonly PublicMappingRule[] = publicMappingRulesV1R2;

const allowedFields: Readonly<Record<TrainingSourceId, readonly string[]>> = {
  HATEMOJI_BUILD: ["label_gold", "type", "target", "matched_id", "round.base", "round.set", "set"],
  TOXIGEN_ANNOTATED: ["label", "toxicity_human", "toxicity_ai", "intent", "lewd", "framing", "stereotyping", "target_group", "predicted_author", "predicted_group", "factual?", "ingroup_effect", "actual_method"],
  CIVIL_COMMENTS_1_2_4: ["toxicity", "severe_toxicity", "obscene", "threat", "insult", "identity_attack", "sexual_explicit"],
  MEASURING_HATE_SPEECH: ["hate_speech_score", "hatespeech", "violence", "genocide", "dehumanize", "insult", "attack_defend", "humiliate", "status", "sentiment", "respect"],
};

export const validateMappingRules = (rules: readonly PublicMappingRule[]): void => {
  const ids = new Set<string>(); const fallback = new Map<TrainingSourceId, number>(); const fallbackSeen = new Set<TrainingSourceId>();
  const expectedVersion = rules[0]?.mappingVersion;
  if (!expectedVersion) throw new Error("Mapping rules cannot be empty");
  for (const item of rules) {
    requireTrainingSource(item.sourceId);
    if (item.mappingVersion !== expectedVersion) throw new Error(`Mapping version mismatch for ${item.ruleId}`);
    if (ids.has(item.ruleId)) throw new Error(`Duplicate mapping rule ID ${item.ruleId}`); ids.add(item.ruleId);
    item.sourceCondition.forEach((condition) => { if (!allowedFields[item.sourceId].includes(condition.field)) throw new Error(`Unsupported ${item.sourceId} field ${condition.field}`); });
    for (const category of [item.mappedPrimaryCategory, ...item.mappedSecondaryCategories].filter(Boolean) as SthnCategory[]) {
      if (categorySupport[item.sourceId][category] === "NOT_SUPPORTED") throw new Error(`${item.sourceId} cannot map unsupported category ${category}`);
    }
    if (item.mappedDecision === "NEEDS_REVIEW" && (!item.reviewRequired || item.mappingConfidence !== "LOW")) throw new Error(`NEEDS_REVIEW must remain review-required and LOW confidence`);
    if (item.mappedDecision === "BLOCK" && !item.mappedPrimaryCategory) throw new Error(`BLOCK rule ${item.ruleId} requires a category`);
    if (fallbackSeen.has(item.sourceId) && item.sourceCondition.length) throw new Error(`${item.sourceId} has a rule after its fallback`);
    if (!item.sourceCondition.length) { fallback.set(item.sourceId, (fallback.get(item.sourceId) ?? 0) + 1); fallbackSeen.add(item.sourceId); }
  }
  for (const sourceId of Object.keys(allowedFields) as TrainingSourceId[]) if (fallback.get(sourceId) !== 1) throw new Error(`${sourceId} requires exactly one fallback rule`);
};

const matches = (labels: OriginalLabels, condition: MappingCondition): boolean => {
  const actual = labels[condition.field];
  if (Array.isArray(actual) || (actual !== null && typeof actual === "object")) return false;
  if (condition.operator === "EQ") return String(actual) === String(condition.value);
  if (condition.operator === "NEQ") return String(actual) !== String(condition.value);
  if (condition.operator === "IN") return Array.isArray(condition.value) && condition.value.map(String).includes(String(actual));
  const numeric = Number(actual); const expected = Number(condition.value);
  return Number.isFinite(numeric) && Number.isFinite(expected) && (condition.operator === "GTE" ? numeric >= expected : numeric <= expected);
};

export const previewRowMapping = (row: ProvenanceStagingRow, rules = publicMappingRules): PublicMappingRule => {
  requireTrainingSource(row.sourceDataset);
  const matched = rules.filter((item) => item.sourceId === row.sourceDataset).find((item) => item.sourceCondition.every((condition) => matches(row.originalLabels, condition)));
  if (!matched) throw new Error(`No mapping fallback for ${row.sourceDataset}`);
  return matched;
};

export const previewMappings = (rows: readonly ProvenanceStagingRow[], rules = publicMappingRules): readonly MappingPreviewResult[] => {
  validateMappingRules(rules); const bySource = new Map<TrainingSourceId, ProvenanceStagingRow[]>();
  rows.forEach((row) => { const source = requireTrainingSource(row.sourceDataset).sourceId; bySource.set(source, [...(bySource.get(source) ?? []), row]); });
  return [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourceId, sourceRows]) => {
    const ruleCounts: Record<string, number> = {}; const categoryCounts: Record<string, number> = {}; let wouldAllow = 0; let wouldBlock = 0; let wouldNeedReview = 0;
    sourceRows.forEach((row) => { const mapped = previewRowMapping(row, rules); ruleCounts[mapped.ruleId] = (ruleCounts[mapped.ruleId] ?? 0) + 1;
      if (mapped.mappedDecision === "ALLOW") wouldAllow += 1; else if (mapped.mappedDecision === "BLOCK") wouldBlock += 1; else wouldNeedReview += 1;
      if (mapped.mappedPrimaryCategory) categoryCounts[mapped.mappedPrimaryCategory] = (categoryCounts[mapped.mappedPrimaryCategory] ?? 0) + 1;
      mapped.mappedSecondaryCategories.forEach((category) => { categoryCounts[category] = (categoryCounts[category] ?? 0) + 1; }); });
    return { mappingVersion: rules[0].mappingVersion, sourceId, total: sourceRows.length, wouldAllow, wouldBlock, wouldNeedReview,
      categoryCounts: Object.fromEntries(Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b))), ruleCounts: Object.fromEntries(Object.entries(ruleCounts).sort(([a], [b]) => a.localeCompare(b))) };
  });
};
