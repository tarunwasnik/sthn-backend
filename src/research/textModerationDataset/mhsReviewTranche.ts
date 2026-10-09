import crypto from "node:crypto";
import { HumanAuditDecision } from "./audit";
import { OriginalLabels, PiiStatus, ProvenanceStagingRow, SourceScalar } from "./contracts";
import { MHS_AUDIT_STRATA, MhsAuditReasonCode, MhsAuditStratum, MhsSourceSummary, classifyMhsAuditStrata, summarizeMhsSource } from "./mhsMappingAudit";
import { SthnCategory } from "./mapping";
import { sourceRegistry } from "./registries";

export const MHS_REVIEW_TRANCHE_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_TRANCHE_V1" as const;
export const MHS_REVIEW_TRANCHE_SEED = "STHN-T6L-6J-MHS-REVIEW-TRANCHE-2026-09-08" as const;
export const MHS_REVIEW_TRANCHE_SIZE = 3000 as const;
export const MHS_REVIEW_SOURCE_REVISION = sourceRegistry.MEASURING_HATE_SPEECH.revision;
export const MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST = "65919eed466aadc9175844d71f91799b17220795c01685211991036bc47e094b" as const;
export const MHS_REVIEW_AUTHORITY_POLICY_VERSION = "STHN_TEXT_MODERATION_MHS_SINGLE_REVIEW_AUTHORITY_V1" as const;

export const MHS_REVIEW_ALLOCATION = {
  DISAGREEMENT_OR_SOURCE_INCONSISTENCY: 800,
  VIOLENCE_OR_GENOCIDE: 600,
  PROTECTED_DEHUMANIZATION_OR_HIGH_SCORE: 600,
  LOW_SCORE_CONTEXT_OR_COUNTERSPEECH: 500,
  NON_HATE_ABUSE_OR_NO_CLEAR_PROTECTED_TARGET: 500,
} as const;
export type MhsReviewAllocation = keyof typeof MHS_REVIEW_ALLOCATION;
export type ReviewerSlot = "A";
export type ReviewerIndependenceStatus = "SOLE_REVIEWER_PENDING" | "SOLE_REVIEWER_COMPLETE"
  | "AWAITING_BOTH" | "AWAITING_REVIEWER_A" | "AWAITING_REVIEWER_B" | "DECLARED_INDEPENDENT" | "INVALID";
export type TrancheDisposition = "AWAITING_HUMAN_REVIEW" | "ADJUDICATION_REQUIRED" | "RESOLVED" | "EXCLUDED";
export type TrancheReasonCode = MhsAuditReasonCode | "OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION" | "UNRESOLVABLE_POLICY_AMBIGUITY" | "NON_LANGUAGE_CONTENT" | "SOURCE_ARTIFACT" | "PROVENANCE_DEFECT" | "PII_REQUIRES_EXCLUSION"
  | "POLICY_ACCEPTABLE" | "DIRECT_PROFANITY" | "SEXUAL_CONTENT" | "TARGETED_ABUSE" | "PROTECTED_GROUP_HATE" | "THREAT_OR_VIOLENCE" | "BENIGN_CONTEXT" | "OTHER_POLICY_MISMATCH";

export interface TrancheReview {
  readonly slot: ReviewerSlot;
  readonly reviewerId: string;
  readonly independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS";
  readonly decision: HumanAuditDecision;
  readonly primaryCategory: SthnCategory | null;
  readonly secondaryCategories: readonly SthnCategory[];
  readonly reasonCode: TrancheReasonCode;
  readonly reviewNotes: string | null;
  readonly reviewedTextDigest: string;
  readonly reviewedAt: string;
}

export interface TrancheAdjudication {
  readonly adjudicatorId: string;
  readonly finalDecision: Exclude<HumanAuditDecision, "NEEDS_ADJUDICATION">;
  readonly finalPrimaryCategory: SthnCategory | null;
  readonly finalSecondaryCategories: readonly SthnCategory[];
  readonly adjudicationReasonCode: TrancheReasonCode;
  readonly adjudicationNotes: string | null;
  readonly reviewedTextDigest: string;
  readonly adjudicatedAt: string;
}

export interface TrancheTransformation extends Readonly<Record<string, SourceScalar>> {
  readonly type: "REDACTION";
  readonly inputTextDigest: string;
  readonly outputTextDigest: string;
  readonly reason: string;
  readonly transformedAt: string;
}

export interface MhsReviewTrancheRow {
  readonly trancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly seed: typeof MHS_REVIEW_TRANCHE_SEED;
  readonly sourceRevision: typeof MHS_REVIEW_SOURCE_REVISION;
  readonly sourceId: "MEASURING_HATE_SPEECH";
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly allocation: MhsReviewAllocation;
  readonly membershipStrata: readonly MhsAuditStratum[];
  readonly sourceEvidenceSummary: MhsSourceSummary;
  readonly originalLabels: OriginalLabels;
  readonly text: string;
  readonly textDigest: string;
  readonly lineageRootId: string;
  readonly transformationHistory: readonly Readonly<Record<string, SourceScalar>>[];
  readonly piiStatus: PiiStatus;
  readonly reviewA: TrancheReview | null;
  /** Frozen T6L-6J provenance field. Reviewer B is retired and this must remain null. */
  readonly reviewB: null;
  readonly reviewerIndependenceStatus: ReviewerIndependenceStatus;
  readonly adjudication: TrancheAdjudication | null;
  readonly finalDisposition: TrancheDisposition;
  readonly finalDecision: "ALLOW" | "BLOCK" | null;
  readonly finalPrimaryCategory: SthnCategory | null;
  readonly finalSecondaryCategories: readonly SthnCategory[];
  readonly finalReasonCode: TrancheReasonCode | null;
  readonly trainingEligible: boolean;
  readonly candidateStatus: "PUBLIC_REVIEW_PREPARED" | "PUBLIC_REVIEWED_CANDIDATE";
  readonly split: "UNASSIGNED";
  readonly reviewedAt: string | null;
}

export interface PublicReviewedCandidate {
  readonly candidateStatus: "PUBLIC_REVIEWED_CANDIDATE";
  readonly trancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly sourceId: "MEASURING_HATE_SPEECH";
  readonly sourceRevision: typeof MHS_REVIEW_SOURCE_REVISION;
  readonly sourceRowId: string;
  readonly commentId: string;
  readonly lineageRootId: string;
  readonly transformationHistory: readonly Readonly<Record<string, SourceScalar>>[];
  readonly text: string;
  readonly decision: "ALLOW" | "BLOCK";
  readonly primaryCategory: SthnCategory | null;
  readonly secondaryCategories: readonly SthnCategory[];
  readonly split: "UNASSIGNED";
}

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (...parts: readonly string[]): string => sha256(JSON.stringify(parts));
export const trancheTextDigest = (text: string): string => sha256(text);
export const mhsReviewTrancheMembershipDigest = (rows: readonly Pick<MhsReviewTrancheRow, "sourceRowId" | "allocation">[]): string => digest(...rows.map((row) => `${row.allocation}:${row.sourceRowId}`));

const allocationMatches = (allocation: MhsReviewAllocation, strata: readonly MhsAuditStratum[], summary: MhsSourceSummary): boolean => {
  switch (allocation) {
    case "DISAGREEMENT_OR_SOURCE_INCONSISTENCY": return strata.includes("HIGH_DISAGREEMENT") || strata.includes("SOURCE_INCONSISTENCY");
    case "VIOLENCE_OR_GENOCIDE": return strata.includes("VIOLENCE") || strata.includes("GENOCIDE");
    case "PROTECTED_DEHUMANIZATION_OR_HIGH_SCORE": return strata.includes("PROTECTED_TARGET") && (strata.includes("DEHUMANIZATION") || strata.includes("HIGH_SCORE"));
    case "LOW_SCORE_CONTEXT_OR_COUNTERSPEECH": return strata.includes("LOW_SCORE") && (strata.includes("CONTEXT_CANDIDATE") || summary.constructs.attack_defend.mean < 2);
    case "NON_HATE_ABUSE_OR_NO_CLEAR_PROTECTED_TARGET": return strata.includes("NON_HATE_ABUSE_CANDIDATE") || strata.includes("NO_CLEAR_PROTECTED_TARGET");
  }
};

export const selectMhsReviewTranche = (rows: readonly ProvenanceStagingRow[], seed = MHS_REVIEW_TRANCHE_SEED): readonly MhsReviewTrancheRow[] => {
  const candidates = rows.map((row) => {
    if (row.sourceDataset !== "MEASURING_HATE_SPEECH") throw new Error("MHS review tranche accepts only MHS rows");
    const summary = summarizeMhsSource(row); return { row, summary, strata: classifyMhsAuditStrata(row, summary) };
  });
  const selected: Array<(typeof candidates)[number] & { allocation: MhsReviewAllocation }> = []; const used = new Set<string>();
  (Object.entries(MHS_REVIEW_ALLOCATION) as Array<[MhsReviewAllocation, number]>).forEach(([allocation, quota]) => {
    const bucket = candidates.filter((item) => !used.has(item.row.sourceRowId) && allocationMatches(allocation, item.strata, item.summary))
      .map((item) => ({ item, rank: digest(seed, allocation, item.row.sourceRowId) })).sort((a, b) => a.rank.localeCompare(b.rank)).map(({ item }) => item);
    if (bucket.length < quota) throw new Error(`MHS tranche ${allocation} underflow: ${bucket.length}/${quota}`);
    bucket.slice(0, quota).forEach((item) => { selected.push({ ...item, allocation }); used.add(item.row.sourceRowId); });
  });
  if (selected.length !== MHS_REVIEW_TRANCHE_SIZE || used.size !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("MHS review tranche membership is not 3,000 unique content rows");
  return selected.map(({ row, summary, strata, allocation }) => ({
    trancheVersion: MHS_REVIEW_TRANCHE_VERSION, seed: MHS_REVIEW_TRANCHE_SEED, sourceRevision: MHS_REVIEW_SOURCE_REVISION,
    sourceId: "MEASURING_HATE_SPEECH", sourceRowId: row.sourceRowId, commentId: `mhs_comment_${digest("MHS_COMMENT", row.sourceRowId)}`,
    allocation, membershipStrata: strata, sourceEvidenceSummary: summary, originalLabels: row.originalLabels, text: row.text,
    textDigest: trancheTextDigest(row.text), lineageRootId: row.lineageRootId ?? row.sourceRowId, transformationHistory: row.transformationHistory,
    piiStatus: row.piiStatus, reviewA: null, reviewB: null, reviewerIndependenceStatus: "SOLE_REVIEWER_PENDING", adjudication: null,
    finalDisposition: "AWAITING_HUMAN_REVIEW", finalDecision: null, finalPrimaryCategory: null, finalSecondaryCategories: [], finalReasonCode: null,
    trainingEligible: false, candidateStatus: "PUBLIC_REVIEW_PREPARED", split: "UNASSIGNED", reviewedAt: null,
  }));
};

const assertCategories = (decision: HumanAuditDecision, primary: SthnCategory | null, secondary: readonly SthnCategory[]): void => {
  if (new Set(secondary).size !== secondary.length || (primary && secondary.includes(primary))) throw new Error("Review categories must be unique");
  if (decision === "BLOCK" && !primary) throw new Error("BLOCK review requires a primary category");
  if (decision !== "BLOCK" && (primary || secondary.length)) throw new Error("Non-BLOCK review cannot carry categories");
};
const assertReview = (row: MhsReviewTrancheRow, review: TrancheReview): void => {
  if (review.slot !== "A" || !review.reviewerId.trim() || review.independenceDeclaration !== "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS") throw new Error("Sole Reviewer A identity or independence declaration is invalid");
  if (review.reviewedTextDigest !== row.textDigest) throw new Error("Review is not bound to the tranche final text");
  if (!Number.isFinite(Date.parse(review.reviewedAt)) || (review.reviewNotes?.length ?? 0) > 500) throw new Error("Review metadata is invalid or unbounded");
  assertCategories(review.decision, review.primaryCategory, review.secondaryCategories);
};
const eligiblePii = (status: PiiStatus): boolean => status === "NONE" || status === "REDACTED";

const resolveSingleReview = (row: MhsReviewTrancheRow): MhsReviewTrancheRow => {
  if (!row.reviewA) return { ...row, reviewerIndependenceStatus: "SOLE_REVIEWER_PENDING" };
  const base = { ...row, reviewerIndependenceStatus: "SOLE_REVIEWER_COMPLETE" as const, trainingEligible: false as const,
    candidateStatus: "PUBLIC_REVIEW_PREPARED" as const, reviewedAt: row.reviewA.reviewedAt };
  if (row.reviewA.decision === "NEEDS_ADJUDICATION") return { ...base, finalDisposition: "ADJUDICATION_REQUIRED", finalDecision: null,
    finalPrimaryCategory: null, finalSecondaryCategories: [], finalReasonCode: null };
  if (row.reviewA.decision === "EXCLUDE") return { ...base, finalDisposition: "EXCLUDED", finalDecision: null,
    finalPrimaryCategory: null, finalSecondaryCategories: [], finalReasonCode: row.reviewA.reasonCode };
  return { ...base, finalDisposition: "RESOLVED", finalDecision: row.reviewA.decision, finalPrimaryCategory: row.reviewA.primaryCategory,
    finalSecondaryCategories: row.reviewA.secondaryCategories, finalReasonCode: row.reviewA.reasonCode };
};

export const submitTrancheReview = (row: MhsReviewTrancheRow, review: TrancheReview): MhsReviewTrancheRow => {
  assertReview(row, review); if (row.reviewA) throw new Error("Sole Reviewer A slot is already occupied");
  if (row.reviewB !== null) throw new Error("Retired Reviewer B data is not accepted by the active single-review workflow");
  return resolveSingleReview({ ...row, reviewA: { ...review, secondaryCategories: [...review.secondaryCategories] } });
};

export const submitTrancheAdjudication = (_row: MhsReviewTrancheRow, _adjudication: TrancheAdjudication): MhsReviewTrancheRow => {
  throw new Error("Single-review adjudication is not implemented; a separately authorized phase is required");
};

export const applyPiiDisposition = (row: MhsReviewTrancheRow, piiStatus: "NONE" | "EXCLUDE"): MhsReviewTrancheRow => {
  if (piiStatus === "EXCLUDE") return { ...row, piiStatus, finalDisposition: "EXCLUDED", finalDecision: null, finalPrimaryCategory: null, finalSecondaryCategories: [], finalReasonCode: "PII_REQUIRES_EXCLUSION", trainingEligible: false, candidateStatus: "PUBLIC_REVIEW_PREPARED" };
  return { ...row, piiStatus, trainingEligible: false, candidateStatus: "PUBLIC_REVIEW_PREPARED" };
};

export const applyTrancheRedaction = (row: MhsReviewTrancheRow, redactedText: string, reason: string, transformedAt: string): MhsReviewTrancheRow => {
  if (!redactedText.trim() || redactedText === row.text || !reason.trim() || !Number.isFinite(Date.parse(transformedAt))) throw new Error("Invalid redaction transformation");
  if (row.reviewA || row.reviewB || row.adjudication) throw new Error("Redaction must occur before review so reviewers see final text");
  const outputTextDigest = trancheTextDigest(redactedText); const transformation: TrancheTransformation = { type: "REDACTION", inputTextDigest: row.textDigest, outputTextDigest, reason, transformedAt };
  return { ...row, text: redactedText, textDigest: outputTextDigest, piiStatus: "REDACTED", transformationHistory: [...row.transformationHistory, transformation] };
};

export const validateMhsReviewTrancheRow = (row: MhsReviewTrancheRow): void => {
  if (row.trancheVersion !== MHS_REVIEW_TRANCHE_VERSION || row.sourceRevision !== MHS_REVIEW_SOURCE_REVISION || row.sourceId !== "MEASURING_HATE_SPEECH" || !row.sourceRowId || !row.commentId || !row.text || row.textDigest !== trancheTextDigest(row.text)) throw new Error("Invalid MHS tranche provenance or text binding");
  if (!MHS_AUDIT_STRATA.some((stratum) => row.membershipStrata.includes(stratum)) || row.split !== "UNASSIGNED") throw new Error("Invalid MHS tranche membership or split");
  if (row.reviewA) assertReview(row, row.reviewA); if (row.reviewB !== null) throw new Error("Reviewer B is retired from the active MHS workflow");
  if (row.trainingEligible && (row.finalDisposition !== "RESOLVED" || !row.finalDecision || !eligiblePii(row.piiStatus) || row.candidateStatus !== "PUBLIC_REVIEWED_CANDIDATE")) throw new Error("Invalid training eligibility");
  if (row.trainingEligible && row.finalDecision === "BLOCK" && !row.finalPrimaryCategory) throw new Error("Eligible BLOCK row lacks category");
  if (row.finalDisposition === "ADJUDICATION_REQUIRED" && row.trainingEligible) throw new Error("Unresolved review cannot be eligible");
  if (row.finalDisposition === "EXCLUDED" && row.trainingEligible) throw new Error("Excluded row cannot be eligible");
};

export const toPublicReviewedCandidate = (row: MhsReviewTrancheRow): PublicReviewedCandidate => {
  validateMhsReviewTrancheRow(row); if (!row.trainingEligible || !row.finalDecision) throw new Error("Only resolved training-eligible rows may enter the candidate artifact");
  return { candidateStatus: "PUBLIC_REVIEWED_CANDIDATE", trancheVersion: row.trancheVersion, sourceId: row.sourceId, sourceRevision: row.sourceRevision,
    sourceRowId: row.sourceRowId, commentId: row.commentId, lineageRootId: row.lineageRootId, transformationHistory: row.transformationHistory,
    text: row.text, decision: row.finalDecision, primaryCategory: row.finalPrimaryCategory, secondaryCategories: row.finalSecondaryCategories, split: "UNASSIGNED" };
};
