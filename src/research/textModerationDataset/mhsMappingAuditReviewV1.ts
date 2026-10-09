import { HumanAuditDecision } from "./audit";
import {
  MHS_MAPPING_AUDIT_SIZE, MhsAuditReasonCode, MhsMappingAuditRow, MhsPolicyReview,
  mhsAuditMembershipDigest, resolveMhsReviews,
} from "./mhsMappingAudit";
import { SthnCategory } from "./mapping";

export const MHS_MAPPING_AUDIT_SAMPLE_DIGEST = "395316f4f8fc1bc0fc6bc0cf620f22d90ed17d4c7b6339e3d50f6358c2e01c2d" as const;

interface Judgment { decision: HumanAuditDecision; categories?: readonly SthnCategory[]; reason: MhsAuditReasonCode; notes?: string; }
const allow = (reason: MhsAuditReasonCode = "SOURCE_MEASUREMENT_TOO_BROAD", notes?: string): Judgment => ({ decision: "ALLOW", reason, notes });
const block = (categories: readonly SthnCategory[], reason: MhsAuditReasonCode = "SOURCE_MEASUREMENT_MATCHES_STHN", notes?: string): Judgment => ({ decision: "BLOCK", categories, reason, notes });
const needs = (reason: MhsAuditReasonCode = "INSUFFICIENT_CONTEXT", notes?: string): Judgment => ({ decision: "NEEDS_ADJUDICATION", reason, notes });
const exclude = (notes: string): Judgment => ({ decision: "EXCLUDE", reason: "PII_OR_DATA_QUALITY", notes });

const byIndex = new Map<number, Judgment>();
for (let index = 0; index < MHS_MAPPING_AUDIT_SIZE; index += 1) byIndex.set(index, allow());
const set = (indexes: readonly number[], judgment: Judgment): void => indexes.forEach((index) => byIndex.set(index, judgment));

set([
  0, 3, 5, 6, 11, 12, 14, 16, 17, 21, 34, 40, 48, 49, 51, 55, 56, 57,
  61, 62, 74, 79, 82, 85, 86, 87, 107, 110, 113, 124, 126, 128, 134, 137, 138,
  140, 143, 145, 151, 154, 161, 163, 175, 179, 184, 185, 191, 196, 200, 205, 214,
  217, 248, 252, 254, 257, 263, 272, 280, 284, 287, 288, 294,
], block(["HATE"]));

set([4, 13, 103, 105, 132], block(["THREAT_OR_VIOLENCE", "HATE"], "THREAT_FIRST_COLLISION"));
set([7, 31, 96, 98, 122, 127, 142, 158, 164, 165, 168, 171, 177, 188, 209, 233, 234, 249, 289], block(["THREAT_OR_VIOLENCE"], "THREAT_FIRST_COLLISION"));
set([159], block(["SEXUAL", "THREAT_OR_VIOLENCE"], "THREAT_FIRST_COLLISION"));

set([
  1, 2, 9, 10, 15, 18, 19, 32, 41, 42, 44, 47, 89, 92, 102, 108, 112, 115,
  119, 129, 144, 149, 157, 174, 176, 186, 189, 194, 195, 197, 198, 203, 210, 218,
  221, 223, 228, 229, 237, 238, 239, 243, 245, 251, 253, 258, 267, 273, 282, 283,
  286, 293, 295, 297,
], block(["ABUSIVE_OR_HARASSING"], "NON_HATE_ABUSE"));

set([
  45, 46, 52, 58, 64, 68, 72, 81, 94, 97, 100, 104, 109, 123, 125, 133, 135,
  148, 150, 152, 153, 156, 170, 183, 202, 211, 230, 292,
], block(["SEXUAL"], "SOURCE_MEASUREMENT_TOO_NARROW"));
set([53, 136], block(["PROFANITY"], "SOURCE_MEASUREMENT_TOO_NARROW"));

set([8, 20, 26, 27, 80, 88, 93, 155, 162, 167, 173, 181, 182, 208, 212, 219, 226, 236, 279, 291, 299], needs());
set([285], exclude("The available preview is incoherent/truncated and cannot support a reliable policy disposition."));

// These were reviewed as quotation, reporting, counterspeech, self-reference, or benign identity discussion.
set([24, 33, 35, 50, 54, 59, 66, 68, 70, 78, 99, 101, 106, 111, 130, 131, 147, 160, 166, 169, 178, 188, 213, 218, 240, 241, 242, 244, 246, 250, 255, 259, 265, 266, 274, 275, 276, 283, 290, 298], allow("COUNTERSPEECH_OR_REPORTING"));

// Re-apply policy blocks where an item contains context but still directly admits prohibited content.
set([68], block(["SEXUAL"], "SOURCE_MEASUREMENT_TOO_NARROW"));
set([188], block(["THREAT_OR_VIOLENCE"], "THREAT_FIRST_COLLISION"));
set([218, 283], block(["ABUSIVE_OR_HARASSING"], "NON_HATE_ABUSE"));

const review = (judgment: Judgment): MhsPolicyReview => ({
  reviewerId: "STHN_POLICY_REVIEW_V1", decision: judgment.decision, categories: judgment.categories ?? [],
  reasonCode: judgment.reason, notes: judgment.notes ?? null,
});

export const applyMhsMappingAuditReviewV1 = (rows: readonly MhsMappingAuditRow[]): readonly MhsMappingAuditRow[] => {
  if (rows.length !== MHS_MAPPING_AUDIT_SIZE || mhsAuditMembershipDigest(rows) !== MHS_MAPPING_AUDIT_SAMPLE_DIGEST) throw new Error("MHS audit sample identity changed; do not apply index-bound judgments");
  if (byIndex.size !== rows.length) throw new Error(`MHS policy-review coverage mismatch: ${byIndex.size}/${rows.length}`);
  return rows.map((row, index) => {
    const judgment = byIndex.get(index); if (!judgment) throw new Error(`Missing MHS judgment ${index}`);
    return resolveMhsReviews(row, [review(judgment)]);
  });
};
