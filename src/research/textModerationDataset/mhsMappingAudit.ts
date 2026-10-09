import crypto from "node:crypto";
import { ProvenanceStagingRow } from "./contracts";
import { HumanAuditDecision } from "./audit";
import { SthnCategory } from "./mapping";

export const MHS_MAPPING_AUDIT_VERSION = "STHN_TEXT_MODERATION_MHS_MAPPING_AUDIT_V1" as const;
export const MHS_MAPPING_AUDIT_SEED = "STHN-T6L-6I-MHS-AUDIT-2026-09-08" as const;
export const MHS_MAPPING_AUDIT_SIZE = 300 as const;
/** T6L-6I produced no evidence-eligible automatic rule and therefore no V1R3 draft. */
export const MHS_AUTOMATIC_RULE_CANDIDATES = [] as const;
export const MHS_DRAFT_MAPPING_VERSION = null;

export const MHS_AUDIT_STRATA = [
  "HIGH_SCORE", "LOW_SCORE", "MIDDLE_SCORE", "HIGH_AGREEMENT", "HIGH_DISAGREEMENT",
  "DEHUMANIZATION", "INSULT_OR_HUMILIATION", "VIOLENCE", "GENOCIDE", "ATTACK_OR_DEFEND",
  "PROTECTED_TARGET", "NO_CLEAR_PROTECTED_TARGET", "CONTEXT_CANDIDATE", "NON_HATE_ABUSE_CANDIDATE",
  "SOURCE_INCONSISTENCY",
] as const;
export type MhsAuditStratum = typeof MHS_AUDIT_STRATA[number];
export type MhsAuditReasonCode =
  | "SOURCE_MEASUREMENT_MATCHES_STHN" | "SOURCE_MEASUREMENT_TOO_BROAD" | "SOURCE_MEASUREMENT_TOO_NARROW"
  | "COUNTERSPEECH_OR_REPORTING" | "NON_HATE_ABUSE" | "THREAT_FIRST_COLLISION" | "PROTECTED_GROUP_MISMATCH"
  | "ANNOTATOR_DISAGREEMENT" | "SOURCE_CONSTRUCT_INCONSISTENCY" | "INSUFFICIENT_CONTEXT" | "PII_OR_DATA_QUALITY";
export type MhsReviewStatus = "PENDING" | "REVIEWED_SINGLE" | "AGREED_TWO_REVIEW" | "NEEDS_ADJUDICATION" | "ADJUDICATED";

export interface MhsConstructSummary { readonly mean: number; readonly minimum: number; readonly maximum: number; readonly positiveRate: number; }
export interface MhsSourceSummary {
  readonly hateSpeechScore: number;
  readonly annotationCount: number;
  readonly disagreement: { readonly band: "LOW" | "MEDIUM" | "HIGH"; readonly hatespeechAgreementRate: number; readonly conflictingConstructCount: number };
  readonly constructs: Readonly<Record<"hatespeech" | "dehumanize" | "insult" | "humiliate" | "violence" | "genocide" | "attack_defend", MhsConstructSummary>>;
  readonly target: { readonly protectedFamilies: readonly string[]; readonly otherFamilies: readonly string[]; readonly maximumProtectedAgreement: number; readonly hasClearProtectedTarget: boolean };
}
export interface MhsPolicyReview {
  readonly reviewerId: string;
  readonly decision: HumanAuditDecision;
  readonly categories: readonly SthnCategory[];
  readonly reasonCode: MhsAuditReasonCode;
  readonly notes: string | null;
}
export interface MhsMappingAuditRow {
  readonly auditVersion: typeof MHS_MAPPING_AUDIT_VERSION;
  readonly auditSeed: typeof MHS_MAPPING_AUDIT_SEED;
  readonly auditId: string;
  readonly sourceId: "MEASURING_HATE_SPEECH";
  readonly sourceRowId: string;
  /** Stable, non-reversible stand-in for the source-native comment_id. */
  readonly commentId: string;
  readonly textPreview: string;
  readonly selectionStrata: readonly MhsAuditStratum[];
  readonly sourceSummary: MhsSourceSummary;
  readonly reviews: readonly MhsPolicyReview[];
  readonly reviewCount: number;
  readonly reviewAgreement: "NOT_APPLICABLE" | "AGREE" | "DISAGREE" | "ADJUDICATED";
  readonly humanDecision: HumanAuditDecision | null;
  readonly humanPrimaryCategory: SthnCategory | null;
  readonly humanSecondaryCategories: readonly SthnCategory[];
  readonly auditReasonCode: MhsAuditReasonCode | null;
  readonly reviewStatus: MhsReviewStatus;
}

const digest = (...parts: readonly string[]): string => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const values = (row: ProvenanceStagingRow, key: string): readonly number[] => {
  const raw = row.originalLabels[key]; const list = Array.isArray(raw) ? raw : [raw];
  const parsed = list.map(Number); if (!parsed.length || parsed.some((value) => !Number.isFinite(value))) throw new Error(`MHS ${row.sourceRowId} has invalid ${key}`);
  return parsed;
};
const rounded = (value: number): number => Number(value.toFixed(4));
const summarize = (input: readonly number[]): MhsConstructSummary => ({
  mean: rounded(input.reduce((sum, value) => sum + value, 0) / input.length), minimum: Math.min(...input), maximum: Math.max(...input),
  positiveRate: rounded(input.filter((value) => value > 0).length / input.length),
});
const groupAgreement = (input: readonly number[]): number => {
  const counts = new Map<number, number>(); input.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return rounded(Math.max(...counts.values()) / input.length);
};
const targetRate = (row: ProvenanceStagingRow, key: string): number => {
  const raw = row.originalLabels[key]; const input = Array.isArray(raw) ? raw : [raw];
  return input.length ? input.filter(Boolean).length / input.length : 0;
};

const protectedFamilies = ["race", "religion", "origin", "gender", "sexuality", "disability"] as const;
const otherFamilies = ["age", "politics"] as const;
export const summarizeMhsSource = (row: ProvenanceStagingRow): MhsSourceSummary => {
  if (row.sourceDataset !== "MEASURING_HATE_SPEECH") throw new Error("MHS audit accepts only MEASURING_HATE_SPEECH rows");
  const constructKeys = ["hatespeech", "dehumanize", "insult", "humiliate", "violence", "genocide", "attack_defend"] as const;
  const raw = Object.fromEntries(constructKeys.map((key) => [key, values(row, key)])) as Record<typeof constructKeys[number], readonly number[]>;
  const annotationCount = raw.hatespeech.length;
  if (constructKeys.some((key) => raw[key].length !== annotationCount)) throw new Error(`MHS ${row.sourceRowId} construct cardinality mismatch`);
  const hateScores = values(row, "hate_speech_score");
  if (hateScores.length !== annotationCount || new Set(hateScores).size !== 1) throw new Error(`MHS ${row.sourceRowId} aggregate score inconsistency`);
  const agreement = groupAgreement(raw.hatespeech);
  const conflictingConstructCount = constructKeys.filter((key) => Math.max(...raw[key]) - Math.min(...raw[key]) >= 2).length;
  const band = annotationCount < 2 ? "MEDIUM" : agreement < 0.67 || conflictingConstructCount >= 4 ? "HIGH" : agreement < 1 || conflictingConstructCount >= 2 ? "MEDIUM" : "LOW";
  const protectedRates = protectedFamilies.map((family) => [family, targetRate(row, `target_${family}`)] as const);
  const otherRates = otherFamilies.map((family) => [family, targetRate(row, `target_${family}`)] as const);
  const maximumProtectedAgreement = Math.max(0, ...protectedRates.map(([, rate]) => rate));
  return {
    hateSpeechScore: hateScores[0], annotationCount,
    disagreement: { band, hatespeechAgreementRate: agreement, conflictingConstructCount },
    constructs: Object.fromEntries(constructKeys.map((key) => [key, summarize(raw[key])])) as MhsSourceSummary["constructs"],
    target: {
      protectedFamilies: protectedRates.filter(([, rate]) => rate >= 0.5).map(([family]) => family),
      otherFamilies: otherRates.filter(([, rate]) => rate >= 0.5).map(([family]) => family),
      maximumProtectedAgreement: rounded(maximumProtectedAgreement), hasClearProtectedTarget: maximumProtectedAgreement >= 0.5,
    },
  };
};

const contextPattern = /(?:\b(?:quote|quoted|says?|said|report|reported|condemn|oppose|defend|support|against|stop|not all|don't|do not)\b|[“”"])/i;
export const classifyMhsAuditStrata = (row: ProvenanceStagingRow, summary: MhsSourceSummary): readonly MhsAuditStratum[] => {
  const c = summary.constructs; const result: MhsAuditStratum[] = [];
  if (summary.hateSpeechScore > 0.5) result.push("HIGH_SCORE"); else if (summary.hateSpeechScore < -1) result.push("LOW_SCORE"); else result.push("MIDDLE_SCORE");
  if (summary.disagreement.band === "LOW") result.push("HIGH_AGREEMENT");
  if (summary.disagreement.band === "HIGH") result.push("HIGH_DISAGREEMENT");
  if (c.dehumanize.mean >= 1) result.push("DEHUMANIZATION");
  if (Math.max(c.insult.mean, c.humiliate.mean) >= 1) result.push("INSULT_OR_HUMILIATION");
  if (c.violence.mean >= 1) result.push("VIOLENCE"); if (c.genocide.mean >= 1) result.push("GENOCIDE");
  if (c.attack_defend.mean >= 1) result.push("ATTACK_OR_DEFEND");
  result.push(summary.target.hasClearProtectedTarget ? "PROTECTED_TARGET" : "NO_CLEAR_PROTECTED_TARGET");
  if (contextPattern.test(row.text) || (summary.hateSpeechScore < -1 && c.hatespeech.maximum > 0)) result.push("CONTEXT_CANDIDATE");
  if (summary.hateSpeechScore < -1 && Math.max(c.insult.mean, c.humiliate.mean) >= 2 && c.hatespeech.mean < 0.5) result.push("NON_HATE_ABUSE_CANDIDATE");
  if ((summary.hateSpeechScore > 0.5 && c.hatespeech.mean < 0.5) || (summary.hateSpeechScore < -1 && c.hatespeech.mean >= 1) || summary.disagreement.conflictingConstructCount >= 5) result.push("SOURCE_INCONSISTENCY");
  return [...new Set(result)];
};

export const mhsAuditMembershipDigest = (rows: readonly Pick<MhsMappingAuditRow, "auditId">[]): string => digest(...rows.map((row) => row.auditId));

export const selectMhsMappingAuditSample = (rows: readonly ProvenanceStagingRow[], seed = MHS_MAPPING_AUDIT_SEED): readonly MhsMappingAuditRow[] => {
  const candidates = rows.map((row) => ({ row, summary: summarizeMhsSource(row) })).map((item) => ({ ...item, strata: classifyMhsAuditStrata(item.row, item.summary) }));
  const selected: typeof candidates = []; const used = new Set<string>();
  for (const stratum of MHS_AUDIT_STRATA) {
    const bucket = candidates.filter((item) => item.strata.includes(stratum) && !used.has(item.row.sourceRowId))
      .map((item) => ({ item, rank: digest(seed, stratum, item.row.sourceRowId) }))
      .sort((a, b) => a.rank.localeCompare(b.rank)).map(({ item }) => item);
    if (bucket.length < 20) throw new Error(`MHS audit stratum ${stratum} underflow: ${bucket.length}/20`);
    bucket.slice(0, 20).forEach((item) => { selected.push(item); used.add(item.row.sourceRowId); });
  }
  if (selected.length !== MHS_MAPPING_AUDIT_SIZE) throw new Error(`MHS audit sample must contain exactly ${MHS_MAPPING_AUDIT_SIZE} rows`);
  return selected.map(({ row, summary, strata }) => ({
    auditVersion: MHS_MAPPING_AUDIT_VERSION, auditSeed: MHS_MAPPING_AUDIT_SEED,
    auditId: `mhs_audit_${digest(MHS_MAPPING_AUDIT_VERSION, seed, row.sourceRowId)}`, sourceId: "MEASURING_HATE_SPEECH",
    sourceRowId: row.sourceRowId, commentId: `mhs_comment_${digest("MHS_COMMENT", row.sourceRowId)}`,
    textPreview: row.text.slice(0, 280), selectionStrata: strata, sourceSummary: summary, reviews: [], reviewCount: 0,
    reviewAgreement: "NOT_APPLICABLE", humanDecision: null, humanPrimaryCategory: null, humanSecondaryCategories: [], auditReasonCode: null, reviewStatus: "PENDING",
  }));
};

export const resolveMhsReviews = (row: MhsMappingAuditRow, reviews: readonly MhsPolicyReview[], adjudication?: MhsPolicyReview): MhsMappingAuditRow => {
  if (reviews.length < 1 || reviews.length > 2 || new Set(reviews.map((review) => review.reviewerId)).size !== reviews.length) throw new Error("MHS review requires one or two distinct reviewers");
  const equal = reviews.length === 2 && JSON.stringify(reviews[0]) === JSON.stringify({ ...reviews[1], reviewerId: reviews[0].reviewerId });
  if (reviews.length === 2 && !equal && !adjudication) return { ...row, reviews, reviewCount: 2, reviewAgreement: "DISAGREE", humanDecision: null, humanPrimaryCategory: null, humanSecondaryCategories: [], auditReasonCode: null, reviewStatus: "NEEDS_ADJUDICATION" };
  const final = adjudication ?? reviews[0];
  return { ...row, reviews, reviewCount: reviews.length, reviewAgreement: adjudication ? "ADJUDICATED" : reviews.length === 2 ? "AGREE" : "NOT_APPLICABLE", humanDecision: final.decision, humanPrimaryCategory: final.categories[0] ?? null, humanSecondaryCategories: final.categories.slice(1), auditReasonCode: final.reasonCode,
    reviewStatus: adjudication ? "ADJUDICATED" : reviews.length === 2 ? "AGREED_TWO_REVIEW" : "REVIEWED_SINGLE" };
};

export const assertAutomaticRuleEvidence = (rows: readonly MhsMappingAuditRow[]): void => rows.forEach((row) => {
  if (row.reviews.length !== 2 || !["AGREED_TWO_REVIEW", "ADJUDICATED"].includes(row.reviewStatus)) throw new Error(`Automatic-rule evidence ${row.auditId} lacks two independent resolved reviews`);
});

export const validateMhsAuditRow = (row: MhsMappingAuditRow, allowPending = false): void => {
  if (row.auditVersion !== MHS_MAPPING_AUDIT_VERSION || row.sourceId !== "MEASURING_HATE_SPEECH" || !row.auditId || !row.sourceRowId || !row.commentId || !row.textPreview || row.textPreview.length > 280) throw new Error("Invalid bounded MHS audit provenance");
  if (!row.selectionStrata.length || row.sourceSummary.annotationCount < 1) throw new Error("MHS audit row lacks source summary");
  if (row.reviewStatus === "PENDING") { if (allowPending) return; throw new Error(`MHS audit row ${row.auditId} is pending`); }
  if (row.reviewStatus === "NEEDS_ADJUDICATION") { if (row.humanDecision !== null) throw new Error("Unresolved MHS review carries a decision"); return; }
  if (!row.humanDecision || !row.auditReasonCode) throw new Error("Resolved MHS review lacks disposition");
  if (row.humanDecision === "BLOCK" && !row.humanPrimaryCategory) throw new Error("BLOCK MHS review lacks category");
  if (row.humanDecision !== "BLOCK" && (row.humanPrimaryCategory || row.humanSecondaryCategories.length)) throw new Error("Non-BLOCK MHS review carries categories");
};

export interface MhsStratumMetrics { sampled: number; allow: number; block: number; needsAdjudication: number; excluded: number; hateBlocks: number; threatBlocks: number; abusiveBlocks: number; blockPrecisionIfAutoBlocked: number | null; allowPrecisionIfAutoAllowed: number | null; hateCategoryPrecisionAmongBlocks: number | null; }
export const calculateMhsStratumMetrics = (rows: readonly MhsMappingAuditRow[]): Readonly<Record<MhsAuditStratum, MhsStratumMetrics>> => Object.fromEntries(MHS_AUDIT_STRATA.map((stratum) => {
  const items = rows.filter((row) => row.selectionStrata.includes(stratum)); const metric: MhsStratumMetrics = { sampled: items.length, allow: 0, block: 0, needsAdjudication: 0, excluded: 0, hateBlocks: 0, threatBlocks: 0, abusiveBlocks: 0, blockPrecisionIfAutoBlocked: null, allowPrecisionIfAutoAllowed: null, hateCategoryPrecisionAmongBlocks: null };
  items.forEach((row) => { validateMhsAuditRow(row); if (row.humanDecision === "ALLOW") metric.allow++; else if (row.humanDecision === "BLOCK") metric.block++; else if (row.humanDecision === "EXCLUDE") metric.excluded++; else metric.needsAdjudication++; const categories = [row.humanPrimaryCategory, ...row.humanSecondaryCategories]; if (categories.includes("HATE")) metric.hateBlocks++; if (categories.includes("THREAT_OR_VIOLENCE")) metric.threatBlocks++; if (categories.includes("ABUSIVE_OR_HARASSING")) metric.abusiveBlocks++; });
  const conclusive = metric.allow + metric.block; if (conclusive) { metric.blockPrecisionIfAutoBlocked = rounded(metric.block / conclusive); metric.allowPrecisionIfAutoAllowed = rounded(metric.allow / conclusive); }
  if (metric.block) metric.hateCategoryPrecisionAmongBlocks = rounded(metric.hateBlocks / metric.block);
  return [stratum, metric];
})) as Readonly<Record<MhsAuditStratum, MhsStratumMetrics>>;
