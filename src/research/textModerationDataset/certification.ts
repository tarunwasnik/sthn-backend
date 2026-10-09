import crypto from "node:crypto";
import { AuditReasonCode, HumanAuditDecision } from "./audit";
import { ProvenanceStagingRow } from "./contracts";
import { MappingOutcome, SthnCategory, previewRowMapping, publicMappingRulesV1R } from "./mapping";

export const PUBLIC_MAPPING_CERTIFICATION_AUDIT_VERSION = "STHN_TEXT_MODERATION_PUBLIC_MAPPING_CERTIFICATION_AUDIT_V1" as const;
export const PUBLIC_MAPPING_CERTIFICATION_SEED = "STHN-T6L-6H-CERTIFICATION-2026-09-08" as const;
export const MINIMUM_CERTIFICATION_CONCLUSIVE_ROWS = 300 as const;
export const MINIMUM_CERTIFICATION_LOWER_BOUND = 0.99 as const;
export const CERTIFICATION_ALPHA = 0.05 as const;
export type CertificationReviewStatus = "PENDING" | "CONCLUSIVE" | "NON_CONCLUSIVE";
export type CertificationResult = "CERTIFIED" | "REJECTED" | "INSUFFICIENT_SOURCE_SUPPORT";

export interface CertificationAuditRow {
  readonly auditVersion: typeof PUBLIC_MAPPING_CERTIFICATION_AUDIT_VERSION;
  readonly auditSeed: typeof PUBLIC_MAPPING_CERTIFICATION_SEED;
  readonly auditId: string;
  readonly sourceId: "HATEMOJI_BUILD";
  readonly sourceRowId: string;
  readonly sourceSplit: string;
  readonly textPreview: string;
  readonly sourceEvidence: ProvenanceStagingRow["originalLabels"];
  readonly ruleId: string;
  readonly previewDecision: MappingOutcome;
  readonly previewPrimaryCategory: SthnCategory | null;
  readonly previewSecondaryCategories: readonly SthnCategory[];
  readonly humanDecision: HumanAuditDecision | null;
  readonly humanPrimaryCategory: SthnCategory | null;
  readonly humanSecondaryCategories: readonly SthnCategory[];
  readonly auditReasonCode: AuditReasonCode | null;
  readonly reviewStatus: CertificationReviewStatus;
  readonly reviewerNotes: string | null;
}

export interface RuleCertificationMetrics {
  readonly ruleId: string;
  readonly sampled: number;
  readonly conclusive: number;
  readonly confirmedCorrect: number;
  readonly falseBlocks: number;
  readonly decisionPrecision: number | null;
  readonly decisionLower95: number | null;
  readonly categoryCorrect: number;
  readonly categoryMismatches: number;
  readonly categoryPrecision: number | null;
  readonly categoryLower95: number | null;
  readonly result: CertificationResult;
}

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const certificationMembershipDigest = (rows: readonly Pick<CertificationAuditRow, "sourceRowId" | "ruleId">[]): string => digest(...rows.map((row) => `${row.ruleId}:${row.sourceRowId}`));

export const selectCertificationAuditSample = (rows: readonly ProvenanceStagingRow[], priorAuditMembership: ReadonlySet<string>): readonly CertificationAuditRow[] => {
  const ruleIds = publicMappingRulesV1R.filter((rule) => rule.sourceId === "HATEMOJI_BUILD" && rule.mappedDecision === "BLOCK").map((rule) => rule.ruleId);
  const selected = ruleIds.flatMap((ruleId) => rows
    .filter((row) => row.sourceDataset === "HATEMOJI_BUILD" && !priorAuditMembership.has(row.sourceRowId) && previewRowMapping(row, publicMappingRulesV1R).ruleId === ruleId)
    .sort((a, b) => digest(PUBLIC_MAPPING_CERTIFICATION_SEED, ruleId, a.sourceSplit, String(a.originalLabels.target), a.sourceRowId).localeCompare(digest(PUBLIC_MAPPING_CERTIFICATION_SEED, ruleId, b.sourceSplit, String(b.originalLabels.target), b.sourceRowId)))
    .map((row): CertificationAuditRow => { const preview = previewRowMapping(row, publicMappingRulesV1R); return {
      auditVersion: PUBLIC_MAPPING_CERTIFICATION_AUDIT_VERSION, auditSeed: PUBLIC_MAPPING_CERTIFICATION_SEED,
      auditId: `cert_${digest(PUBLIC_MAPPING_CERTIFICATION_AUDIT_VERSION, PUBLIC_MAPPING_CERTIFICATION_SEED, ruleId, row.sourceRowId)}`,
      sourceId: "HATEMOJI_BUILD", sourceRowId: row.sourceRowId, sourceSplit: row.sourceSplit, textPreview: row.text.slice(0, 280), sourceEvidence: row.originalLabels,
      ruleId, previewDecision: preview.mappedDecision, previewPrimaryCategory: preview.mappedPrimaryCategory, previewSecondaryCategories: preview.mappedSecondaryCategories,
      humanDecision: null, humanPrimaryCategory: null, humanSecondaryCategories: [], auditReasonCode: null, reviewStatus: "PENDING", reviewerNotes: null,
    }; }));
  if (new Set(selected.map((row) => row.sourceRowId)).size !== selected.length) throw new Error("Certification sample contains duplicate membership");
  if (selected.some((row) => priorAuditMembership.has(row.sourceRowId))) throw new Error("Certification sample overlaps prior audit membership");
  return selected;
};

export const validateCertificationAuditRow = (row: CertificationAuditRow, priorAuditMembership: ReadonlySet<string>, allowPending = false): void => {
  if (row.auditVersion !== PUBLIC_MAPPING_CERTIFICATION_AUDIT_VERSION || row.auditSeed !== PUBLIC_MAPPING_CERTIFICATION_SEED || !row.auditId || !row.sourceRowId || !row.ruleId || !row.textPreview || row.textPreview.length > 280) throw new Error("Invalid certification audit provenance");
  if (priorAuditMembership.has(row.sourceRowId)) throw new Error(`Certification row overlaps prior audit: ${row.sourceRowId}`);
  if (row.reviewStatus === "PENDING") { if (allowPending && row.humanDecision === null) return; throw new Error(`Certification row ${row.auditId} is pending`); }
  if (!row.humanDecision || !row.auditReasonCode) throw new Error(`Certification row ${row.auditId} lacks review disposition`);
  const conclusive = row.humanDecision === "ALLOW" || row.humanDecision === "BLOCK";
  if ((row.reviewStatus === "CONCLUSIVE") !== conclusive) throw new Error(`Certification row ${row.auditId} has inconsistent reviewStatus`);
  if (row.humanDecision === "BLOCK" && !row.humanPrimaryCategory) throw new Error(`Certification BLOCK row ${row.auditId} lacks category`);
  if (row.humanDecision !== "BLOCK" && (row.humanPrimaryCategory || row.humanSecondaryCategories.length)) throw new Error(`Certification non-BLOCK row ${row.auditId} carries categories`);
};

const binomialUpperTail = (n: number, successes: number, probability: number): number => {
  if (successes <= 0) return 1; if (successes > n) return 0; if (probability <= 0) return 0; if (probability >= 1) return 1;
  let term = Math.exp(Array.from({ length: successes }, (_, index) => Math.log(n - index) - Math.log(index + 1)).reduce((sum, value) => sum + value, 0)
    + successes * Math.log(probability) + (n - successes) * Math.log1p(-probability));
  let total = term;
  for (let value = successes; value < n; value += 1) { term *= ((n - value) / (value + 1)) * (probability / (1 - probability)); total += term; }
  return Math.min(1, total);
};

export const clopperPearsonOneSidedLower = (successes: number, trials: number, alpha = CERTIFICATION_ALPHA): number | null => {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials < 1 || successes > trials || !(alpha > 0 && alpha < 1)) throw new Error("Invalid binomial confidence inputs");
  if (successes === 0) return 0;
  let low = 0; let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) { const middle = (low + high) / 2; if (binomialUpperTail(trials, successes, middle) < alpha) low = middle; else high = middle; }
  return (low + high) / 2;
};

export const calculateRuleCertification = (rows: readonly CertificationAuditRow[]): RuleCertificationMetrics => {
  if (!rows.length) throw new Error("Certification rule sample cannot be empty"); const ruleId = rows[0].ruleId;
  if (rows.some((row) => row.ruleId !== ruleId || row.reviewStatus === "PENDING")) throw new Error("Certification metric input must contain one completed rule");
  const conclusive = rows.filter((row) => row.reviewStatus === "CONCLUSIVE"); const confirmedCorrect = conclusive.filter((row) => row.humanDecision === "BLOCK").length;
  const falseBlocks = conclusive.filter((row) => row.humanDecision === "ALLOW").length;
  const categoryCorrect = conclusive.filter((row) => row.humanDecision === "BLOCK" && row.humanPrimaryCategory === row.previewPrimaryCategory && JSON.stringify(row.humanSecondaryCategories) === JSON.stringify(row.previewSecondaryCategories)).length;
  const categoryMismatches = conclusive.length - categoryCorrect; const decisionPrecision = conclusive.length ? confirmedCorrect / conclusive.length : null;
  const categoryPrecision = conclusive.length ? categoryCorrect / conclusive.length : null;
  const decisionLower95 = conclusive.length ? clopperPearsonOneSidedLower(confirmedCorrect, conclusive.length) : null;
  const categoryLower95 = conclusive.length ? clopperPearsonOneSidedLower(categoryCorrect, conclusive.length) : null;
  const enough = conclusive.length >= MINIMUM_CERTIFICATION_CONCLUSIVE_ROWS;
  const passes = enough && falseBlocks === 0 && categoryMismatches === 0 && (decisionLower95 ?? 0) >= MINIMUM_CERTIFICATION_LOWER_BOUND && (categoryLower95 ?? 0) >= MINIMUM_CERTIFICATION_LOWER_BOUND;
  return { ruleId, sampled: rows.length, conclusive: conclusive.length, confirmedCorrect, falseBlocks, decisionPrecision, decisionLower95, categoryCorrect, categoryMismatches, categoryPrecision, categoryLower95, result: !enough ? "INSUFFICIENT_SOURCE_SUPPORT" : passes ? "CERTIFIED" : "REJECTED" };
};
