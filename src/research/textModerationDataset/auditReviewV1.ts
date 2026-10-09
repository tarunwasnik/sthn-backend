import crypto from "node:crypto";
import { AuditReasonCode, HumanAuditDecision, MappingAuditRow } from "./audit";
import { SthnCategory } from "./mapping";

export const PUBLIC_MAPPING_AUDIT_SAMPLE_DIGEST = "fa345e84157bfa6782cdc978b40b630bb2fd8ed01f9c5c34b681cb074adbdc37" as const;

interface Judgment { decision: HumanAuditDecision; primary?: SthnCategory; secondary?: readonly SthnCategory[]; reason?: AuditReasonCode; note?: string; }
const block = (primary: SthnCategory, secondary: readonly SthnCategory[] = [], reason: AuditReasonCode = "SOURCE_LABEL_MATCHES_STHN", note?: string): Judgment => ({ decision: "BLOCK", primary, secondary, reason, note });
const allow = (reason: AuditReasonCode = "SOURCE_LABEL_TOO_BROAD", note?: string): Judgment => ({ decision: "ALLOW", reason, note });
const needs = (reason: AuditReasonCode = "INSUFFICIENT_CONTEXT", note?: string): Judgment => ({ decision: "NEEDS_ADJUDICATION", reason, note });
const exclude = (note?: string): Judgment => ({ decision: "EXCLUDE", reason: "SYNTHETIC_ARTIFACT", note });

const byIndex = new Map<number, Judgment>();
const set = (indexes: readonly number[], judgment: Judgment): void => indexes.forEach((index) => byIndex.set(index, judgment));
const setEach = (record: Readonly<Record<number, Judgment>>): void => Object.entries(record).forEach(([index, judgment]) => byIndex.set(Number(index), judgment));

// The defaults and exceptions below encode the completed single-reviewer, row-by-row policy audit.
for (let index = 0; index < 80; index += 1) byIndex.set(index, block("HATE"));
setEach({ 36: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH", "Working-class target is not a protected-identity hate target.") });

for (let index = 80; index < 160; index += 1) byIndex.set(index, block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH", "Threat precedence is primary under STHN policy."));
setEach({
  80: needs("SYNTHETIC_ARTIFACT"), 111: block("HATE", [], "SOURCE_LABEL_TOO_BROAD", "Hostile abandonment, not a literal threat."),
  120: needs("INSUFFICIENT_CONTEXT"), 128: block("THREAT_OR_VIOLENCE", [], "PROTECTED_GROUP_MISMATCH"),
  129: block("THREAT_OR_VIOLENCE", [], "PROTECTED_GROUP_MISMATCH"), 134: needs("INSUFFICIENT_CONTEXT"),
});

for (let index = 160; index < 200; index += 1) byIndex.set(index, block("HATE", [], "SOURCE_LABEL_TOO_NARROW"));
setEach({
  166: needs(), 172: allow("SOURCE_LABEL_TOO_BROAD", "Health misinformation is outside the bounded STHN moderation taxonomy."),
  195: block("THREAT_OR_VIOLENCE", ["HATE"], "SOURCE_LABEL_TOO_NARROW"), 198: block("THREAT_OR_VIOLENCE", ["HATE"], "SOURCE_LABEL_TOO_NARROW"),
  199: needs(),
});

for (let index = 200; index < 240; index += 1) byIndex.set(index, allow("SOURCE_LABEL_MATCHES_STHN"));
setEach({
  203: needs(), 205: block("THREAT_OR_VIOLENCE", [], "SOURCE_LABEL_TOO_NARROW"), 209: block("ABUSIVE_OR_HARASSING", ["PROFANITY"], "SOURCE_LABEL_TOO_NARROW"),
  225: block("ABUSIVE_OR_HARASSING", [], "SOURCE_LABEL_TOO_NARROW"), 226: needs(), 227: needs(),
  235: block("THREAT_OR_VIOLENCE", [], "SOURCE_LABEL_TOO_NARROW"), 236: needs(), 237: needs(),
});

for (let index = 240; index < 380; index += 1) byIndex.set(index, block("HATE"));
set([246, 257, 261, 266, 272, 277, 287, 323, 325, 355, 376], allow());
set([263, 276, 285, 308, 315, 327, 335, 339, 340, 345, 353, 360, 365, 377], needs());
set([295, 307, 312, 317, 350, 362], exclude("Truncated, incoherent, or synthetic generation artifact."));
setEach({
  240: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"), 262: block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH"),
  274: block("PROFANITY", [], "PROTECTED_GROUP_MISMATCH"), 283: block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH"),
  284: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"), 286: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"),
  311: block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH"), 313: block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH"),
  334: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"), 361: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"),
});
set([297, 318, 363, 370, 378], block("HATE", [], "PROTECTED_GROUP_MISMATCH"));

setEach({
  380: allow(), 381: block("PROFANITY", [], "PROTECTED_GROUP_MISMATCH"), 382: allow(), 383: needs(), 384: needs("CONTEXT_CHANGES_POLICY"),
  385: allow(), 386: needs(), 387: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 388: needs(), 389: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  390: allow(), 391: allow(), 392: allow("CONTEXT_CHANGES_POLICY"), 393: allow(), 394: allow(), 395: exclude(),
  396: block("ABUSIVE_OR_HARASSING", [], "PROTECTED_GROUP_MISMATCH"), 397: needs(), 398: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  399: allow(), 400: exclude(), 401: exclude(), 402: allow(), 403: allow(), 404: allow(),
  405: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 406: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 407: needs(),
  408: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 409: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 410: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  411: needs(), 412: exclude(), 413: needs(), 414: allow(),
});

for (let index = 415; index < 450; index += 1) byIndex.set(index, allow("SOURCE_LABEL_MATCHES_STHN"));
setEach({ 415: needs(), 421: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 424: exclude(), 428: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 431: needs(), 443: exclude() });

for (let index = 450; index < 480; index += 1) byIndex.set(index, allow("SOURCE_LABEL_MATCHES_STHN"));
setEach({
  450: block("PROFANITY", [], "SOURCE_LABEL_TOO_NARROW"), 451: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  452: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 456: needs(), 457: needs(), 464: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  468: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"), 469: needs(), 470: block("HATE", [], "SOURCE_LABEL_TOO_NARROW"),
  473: needs(), 477: block("ABUSIVE_OR_HARASSING", [], "SOURCE_LABEL_TOO_NARROW"),
  479: block("THREAT_OR_VIOLENCE", ["HATE"], "SOURCE_LABEL_TOO_NARROW"),
});

const sampleDigest = (rows: readonly MappingAuditRow[]): string => crypto.createHash("sha256").update(JSON.stringify(rows.map((row) => row.auditId))).digest("hex");
const exactAgreement = (row: MappingAuditRow, judgment: Judgment): boolean => {
  if (row.previewDecision === "NEEDS_REVIEW") return judgment.decision === "NEEDS_ADJUDICATION";
  if (row.previewDecision !== judgment.decision) return false;
  if (judgment.decision !== "BLOCK") return true;
  return row.previewPrimaryCategory === judgment.primary && JSON.stringify(row.previewSecondaryCategories) === JSON.stringify(judgment.secondary ?? []);
};

export const applyPublicMappingAuditReviewV1 = (rows: readonly MappingAuditRow[]): readonly MappingAuditRow[] => {
  if (rows.length !== 480 || sampleDigest(rows) !== PUBLIC_MAPPING_AUDIT_SAMPLE_DIGEST) throw new Error("Audit sample identity changed; do not apply index-bound human judgments");
  if (byIndex.size !== rows.length) throw new Error(`Human judgment coverage mismatch: ${byIndex.size}/${rows.length}`);
  return rows.map((row, index) => { const judgment = byIndex.get(index); if (!judgment) throw new Error(`No human judgment for audit row ${index}`); return {
    ...row, humanDecision: judgment.decision, humanPrimaryCategory: judgment.primary ?? null,
    humanSecondaryCategories: judgment.secondary ?? [], agreement: exactAgreement(row, judgment),
    auditReasonCode: judgment.reason ?? "OTHER_POLICY_MISMATCH", reviewerNotes: judgment.note ?? null,
  }; });
};
