import crypto from "node:crypto";
import { ProvenanceStagingRow, TrainingSourceId } from "./contracts";
import { MappingOutcome, PublicMappingRule, SthnCategory, previewRowMapping, publicMappingRulesV1 } from "./mapping";

export const PUBLIC_MAPPING_AUDIT_VERSION = "STHN_TEXT_MODERATION_PUBLIC_MAPPING_AUDIT_V1" as const;
export const PUBLIC_MAPPING_AUDIT_SEED = "STHN-T6L-6G-AUDIT-2026-09-08" as const;
export type HumanAuditDecision = "ALLOW" | "BLOCK" | "NEEDS_ADJUDICATION" | "EXCLUDE";
export type AuditReasonCode = "SOURCE_LABEL_MATCHES_STHN" | "SOURCE_LABEL_TOO_BROAD" | "SOURCE_LABEL_TOO_NARROW" | "CONTEXT_CHANGES_POLICY" | "CATEGORY_COLLISION_MISMATCH" | "PROTECTED_GROUP_MISMATCH" | "SYNTHETIC_ARTIFACT" | "INSUFFICIENT_CONTEXT" | "PII_OR_DATA_QUALITY" | "OTHER_POLICY_MISMATCH";

export interface MappingAuditRow {
  readonly auditVersion: typeof PUBLIC_MAPPING_AUDIT_VERSION;
  readonly auditSeed: typeof PUBLIC_MAPPING_AUDIT_SEED;
  readonly auditId: string;
  readonly sourceId: TrainingSourceId;
  readonly sourceRowId: string;
  readonly sourceSplit: string;
  readonly textPreview: string;
  readonly sourceEvidence: ProvenanceStagingRow["originalLabels"];
  readonly previewRuleId: string;
  readonly previewDecision: MappingOutcome;
  readonly previewPrimaryCategory: SthnCategory | null;
  readonly previewSecondaryCategories: readonly SthnCategory[];
  readonly humanDecision: HumanAuditDecision | null;
  readonly humanPrimaryCategory: SthnCategory | null;
  readonly humanSecondaryCategories: readonly SthnCategory[];
  readonly agreement: boolean | null;
  readonly auditReasonCode: AuditReasonCode | null;
  readonly reviewerNotes: string | null;
}

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const scoreBand = (value: unknown): string => { const score = Number(value); return !Number.isFinite(score) ? "missing" : score < 2 ? "low" : score < 4 ? "medium" : "high"; };
const stratum = (row: ProvenanceStagingRow, rule: PublicMappingRule): string => row.sourceDataset === "HATEMOJI_BUILD"
  ? [rule.ruleId, row.sourceSplit, row.originalLabels.type, row.originalLabels.target].join("|")
  : [rule.ruleId, row.sourceSplit, row.originalLabels.target_group, row.originalLabels.actual_method, scoreBand(row.originalLabels.toxicity_human)].join("|");

const pickDiverse = (rows: readonly ProvenanceStagingRow[], quota: number, seed: string): readonly ProvenanceStagingRow[] => {
  const groups = new Map<string, ProvenanceStagingRow[]>();
  rows.forEach((row) => { const rule = previewRowMapping(row, publicMappingRulesV1); const key = stratum(row, rule); groups.set(key, [...(groups.get(key) ?? []), row]); });
  const buckets = [...groups.entries()].sort(([a], [b]) => digest(seed, a).localeCompare(digest(seed, b))).map(([, candidates]) =>
    [...candidates].sort((a, b) => digest(seed, a.sourceRowId).localeCompare(digest(seed, b.sourceRowId))));
  const selected: ProvenanceStagingRow[] = []; let cursor = 0;
  while (selected.length < quota && buckets.some((bucket) => bucket.length)) {
    const bucket = buckets[cursor % buckets.length]; const candidate = bucket.shift(); if (candidate) selected.push(candidate); cursor += 1;
  }
  if (selected.length !== quota) throw new Error(`Audit sample underflow: requested ${quota}, selected ${selected.length}`);
  return selected;
};

export const selectMappingAuditSample = (rows: readonly ProvenanceStagingRow[], seed = PUBLIC_MAPPING_AUDIT_SEED): readonly MappingAuditRow[] => {
  const selected: ProvenanceStagingRow[] = [];
  const hatemoji = rows.filter((row) => row.sourceDataset === "HATEMOJI_BUILD");
  for (const [ruleId, quota] of [["HATEMOJI_DEHUMANIZING_HATE_V1", 80], ["HATEMOJI_HATE_THREAT_V1", 80]] as const) {
    selected.push(...pickDiverse(hatemoji.filter((row) => previewRowMapping(row, publicMappingRulesV1).ruleId === ruleId), quota, `${seed}|${ruleId}`));
  }
  const hatemojiFallback = hatemoji.filter((row) => previewRowMapping(row, publicMappingRulesV1).ruleId === "HATEMOJI_REVIEW_FALLBACK_V1");
  selected.push(...pickDiverse(hatemojiFallback.filter((row) => row.originalLabels.label_gold === "1"), 40, `${seed}|HATEMOJI_REVIEW_HATE`));
  selected.push(...pickDiverse(hatemojiFallback.filter((row) => row.originalLabels.label_gold === "0"), 40, `${seed}|HATEMOJI_REVIEW_NON_HATE`));
  const toxigen = rows.filter((row) => row.sourceDataset === "TOXIGEN_ANNOTATED");
  selected.push(...pickDiverse(toxigen.filter((row) => previewRowMapping(row, publicMappingRulesV1).ruleId === "TOXIGEN_STRONG_HATE_V1"), 140, `${seed}|TOXIGEN_STRONG_HATE_V1`));
  const toxigenFallback = toxigen.filter((row) => previewRowMapping(row, publicMappingRulesV1).ruleId === "TOXIGEN_REVIEW_FALLBACK_V1");
  selected.push(...pickDiverse(toxigenFallback.filter((row) => row.originalLabels.label === "hate"), 35, `${seed}|TOXIGEN_REVIEW_HATE`));
  selected.push(...pickDiverse(toxigenFallback.filter((row) => row.originalLabels.label === "neutral"), 35, `${seed}|TOXIGEN_REVIEW_NEUTRAL`));
  selected.push(...pickDiverse(toxigenFallback.filter((row) => row.originalLabels.label === undefined), 30, `${seed}|TOXIGEN_REVIEW_UNLABELLED`));
  return selected.map((row) => { const preview = previewRowMapping(row, publicMappingRulesV1); return {
    auditVersion: PUBLIC_MAPPING_AUDIT_VERSION, auditSeed: PUBLIC_MAPPING_AUDIT_SEED, auditId: `audit_${digest(PUBLIC_MAPPING_AUDIT_VERSION, seed, row.sourceRowId)}`,
    sourceId: row.sourceDataset as TrainingSourceId, sourceRowId: row.sourceRowId, sourceSplit: row.sourceSplit, textPreview: row.text.slice(0, 280), sourceEvidence: row.originalLabels,
    previewRuleId: preview.ruleId, previewDecision: preview.mappedDecision, previewPrimaryCategory: preview.mappedPrimaryCategory,
    previewSecondaryCategories: preview.mappedSecondaryCategories, humanDecision: null, humanPrimaryCategory: null, humanSecondaryCategories: [],
    agreement: null, auditReasonCode: null, reviewerNotes: null,
  }; });
};

export const validateAuditRow = (row: MappingAuditRow, allowPending = false): void => {
  if (!row.auditId || !row.sourceRowId || !row.textPreview || row.textPreview.length > 280 || row.auditVersion !== PUBLIC_MAPPING_AUDIT_VERSION) throw new Error("Audit row missing required or bounded provenance");
  if (!row.humanDecision) { if (allowPending) return; throw new Error(`Audit row ${row.auditId} is pending`); }
  if (!row.auditReasonCode || row.agreement === null) throw new Error(`Completed audit row ${row.auditId} lacks disposition metadata`);
  if (row.humanDecision === "BLOCK" && !row.humanPrimaryCategory) throw new Error(`BLOCK audit row ${row.auditId} lacks category`);
  if (row.humanDecision !== "BLOCK" && row.humanPrimaryCategory) throw new Error(`Non-BLOCK audit row ${row.auditId} cannot carry primary category`);
};

export interface RuleAuditMetrics { sampled: number; correct: number; incorrect: number; needsAdjudication: number; excluded: number; confirmedAllow: number; confirmedBlock: number; falseBlock: number; falseAllow: number; blockPrecision: number | null; categoryPrecision: number | null; }
export const calculateAuditMetrics = (rows: readonly MappingAuditRow[]): Readonly<Record<string, RuleAuditMetrics>> => {
  const metrics: Record<string, RuleAuditMetrics> = {};
  const exactCategoryMatches: Record<string, number> = {}; const confirmedPreviewBlocks: Record<string, number> = {};
  rows.forEach((row) => { validateAuditRow(row); const current = metrics[row.previewRuleId] ?? { sampled: 0, correct: 0, incorrect: 0, needsAdjudication: 0, excluded: 0, confirmedAllow: 0, confirmedBlock: 0, falseBlock: 0, falseAllow: 0, blockPrecision: null, categoryPrecision: null };
    current.sampled += 1;
    if (row.humanDecision === "NEEDS_ADJUDICATION") current.needsAdjudication += 1;
    else if (row.humanDecision === "EXCLUDE") current.excluded += 1;
    else { if (row.humanDecision === "ALLOW") current.confirmedAllow += 1; else current.confirmedBlock += 1; if (row.agreement) current.correct += 1; else current.incorrect += 1; }
    if (row.previewDecision === "BLOCK" && row.humanDecision === "ALLOW") current.falseBlock += 1;
    if (row.previewDecision === "ALLOW" && row.humanDecision === "BLOCK") current.falseAllow += 1;
    if (row.previewDecision === "BLOCK" && (row.humanDecision === "BLOCK" || row.humanDecision === "ALLOW")) confirmedPreviewBlocks[row.previewRuleId] = (confirmedPreviewBlocks[row.previewRuleId] ?? 0) + 1;
    if (row.previewDecision === "BLOCK" && row.humanDecision === "BLOCK" && row.previewPrimaryCategory === row.humanPrimaryCategory && JSON.stringify(row.previewSecondaryCategories) === JSON.stringify(row.humanSecondaryCategories)) exactCategoryMatches[row.previewRuleId] = (exactCategoryMatches[row.previewRuleId] ?? 0) + 1;
    metrics[row.previewRuleId] = current;
  });
  Object.entries(metrics).forEach(([ruleId, item]) => { const previewBlocks = confirmedPreviewBlocks[ruleId] ?? 0; item.blockPrecision = previewBlocks ? (item.confirmedBlock / previewBlocks) : null; item.categoryPrecision = previewBlocks && item.confirmedBlock ? (exactCategoryMatches[ruleId] ?? 0) / item.confirmedBlock : null; });
  return Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b)));
};

export interface TargetAuditMetrics { sampled: number; previewBlocks: number; confirmedPreviewBlocks: number; confirmedBlocks: number; confirmedAllows: number; needsAdjudication: number; excluded: number; falseBlocks: number; blockPrecision: number | null; }
const targetKey = (row: MappingAuditRow): string => String(row.sourceEvidence.target ?? row.sourceEvidence.target_group ?? "UNSPECIFIED");
export const calculateSourceTargetBreakdown = (rows: readonly MappingAuditRow[]): Readonly<Record<string, TargetAuditMetrics>> => {
  const result: Record<string, TargetAuditMetrics> = {};
  rows.forEach((row) => {
    const key = `${row.sourceId}|${targetKey(row)}`; const item = result[key] ?? { sampled: 0, previewBlocks: 0, confirmedPreviewBlocks: 0, confirmedBlocks: 0, confirmedAllows: 0, needsAdjudication: 0, excluded: 0, falseBlocks: 0, blockPrecision: null };
    item.sampled += 1; if (row.previewDecision === "BLOCK") item.previewBlocks += 1;
    if (row.humanDecision === "BLOCK") { item.confirmedBlocks += 1; if (row.previewDecision === "BLOCK") item.confirmedPreviewBlocks += 1; } else if (row.humanDecision === "ALLOW") item.confirmedAllows += 1; else if (row.humanDecision === "NEEDS_ADJUDICATION") item.needsAdjudication += 1; else item.excluded += 1;
    if (row.previewDecision === "BLOCK" && row.humanDecision === "ALLOW") item.falseBlocks += 1; result[key] = item;
  });
  Object.values(result).forEach((item) => { const decidedPreviewBlocks = item.confirmedPreviewBlocks + item.falseBlocks; item.blockPrecision = item.previewBlocks && decidedPreviewBlocks ? item.confirmedPreviewBlocks / decidedPreviewBlocks : null; });
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};

export const calculateIdentitySensitivePrecision = (rows: readonly MappingAuditRow[]): Readonly<Record<string, { confirmedBlocks: number; falseBlocks: number; precision: number | null }>> => {
  const result: Record<string, { confirmedBlocks: number; falseBlocks: number; precision: number | null }> = {};
  rows.filter((row) => row.previewDecision === "BLOCK" && !["UNSPECIFIED", "['none']", "none"].includes(targetKey(row))).forEach((row) => {
    const item = result[row.sourceId] ?? { confirmedBlocks: 0, falseBlocks: 0, precision: null };
    if (row.humanDecision === "BLOCK") item.confirmedBlocks += 1; else if (row.humanDecision === "ALLOW") item.falseBlocks += 1; result[row.sourceId] = item;
  });
  Object.values(result).forEach((item) => { const decided = item.confirmedBlocks + item.falseBlocks; item.precision = decided ? item.confirmedBlocks / decided : null; });
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};
