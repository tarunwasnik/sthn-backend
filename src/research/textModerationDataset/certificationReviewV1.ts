import { AuditReasonCode, HumanAuditDecision } from "./audit";
import { CertificationAuditRow, certificationMembershipDigest } from "./certification";
import { SthnCategory } from "./mapping";

export const PUBLIC_MAPPING_CERTIFICATION_SAMPLE_DIGEST = "be7c08e61bf46f77b8925eede0c0fbe96c08abdd0cbe282915ad8e1557d06cfa" as const;

interface Judgment { decision: HumanAuditDecision; primary?: SthnCategory; secondary?: readonly SthnCategory[]; reason: AuditReasonCode; note?: string; }
const block = (primary: SthnCategory, secondary: readonly SthnCategory[] = [], reason: AuditReasonCode = "SOURCE_LABEL_MATCHES_STHN", note?: string): Judgment => ({ decision: "BLOCK", primary, secondary, reason, note });
const allow = (reason: AuditReasonCode, note?: string): Judgment => ({ decision: "ALLOW", reason, note });
const needs = (reason: AuditReasonCode = "INSUFFICIENT_CONTEXT", note?: string): Judgment => ({ decision: "NEEDS_ADJUDICATION", reason, note });

const byIndex = new Map<number, Judgment>();
for (let index = 0; index < 276; index += 1) {
  if (index === 0) byIndex.set(index, block("THREAT_OR_VIOLENCE"));
  else if (index <= 122) byIndex.set(index, block("THREAT_OR_VIOLENCE", ["HATE"]));
  else byIndex.set(index, block("HATE"));
}
const set = (indexes: readonly number[], judgment: Judgment): void => indexes.forEach((index) => byIndex.set(index, judgment));

// Rule B non-conclusive symbolic/context cases and conclusive category collisions.
set([24, 50, 59, 67, 106], needs("INSUFFICIENT_CONTEXT", "Symbolic content does not establish a sufficiently clear real threat."));
set([26], block("ABUSIVE_OR_HARASSING", ["HATE"], "CATEGORY_COLLISION_MISMATCH", "Degrading harassment is not a real threat or arranged injury."));
set([77, 94, 109], block("HATE", [], "CATEGORY_COLLISION_MISMATCH", "Identity hostility or exclusion is present without a real threat."));

// Rule A confirmed contextual false blocks and rows that cannot be resolved from the available context.
set([136, 155], allow("CONTEXT_CHANGES_POLICY", "Positive discussion does not become HATE solely because a synthetic template inserts a robot emoji."));
set([158], allow("CONTEXT_CHANGES_POLICY", "Criticism of dehumanizing expectations is contextual discussion, not an attack."));
set([214], allow("PROTECTED_GROUP_MISMATCH", "The speaker describes becoming tanned; no protected-group attack is established."));
set([225, 256], needs("INSUFFICIENT_CONTEXT", "Quoted or reported language has unclear endorsement."));
set([151, 168], block("THREAT_OR_VIOLENCE", ["HATE"], "CATEGORY_COLLISION_MISMATCH", "Explicit identity-motivated physical harm takes threat-first precedence."));

export const applyPublicMappingCertificationReviewV1 = (rows: readonly CertificationAuditRow[]): readonly CertificationAuditRow[] => {
  if (rows.length !== 276 || certificationMembershipDigest(rows) !== PUBLIC_MAPPING_CERTIFICATION_SAMPLE_DIGEST) throw new Error("Certification sample identity changed; do not apply index-bound review judgments");
  if (byIndex.size !== rows.length) throw new Error(`Certification review coverage mismatch: ${byIndex.size}/${rows.length}`);
  return rows.map((row, index) => { const judgment = byIndex.get(index); if (!judgment) throw new Error(`Missing certification judgment ${index}`); const conclusive = judgment.decision === "ALLOW" || judgment.decision === "BLOCK"; return {
    ...row, humanDecision: judgment.decision, humanPrimaryCategory: judgment.primary ?? null, humanSecondaryCategories: judgment.secondary ?? [],
    auditReasonCode: judgment.reason, reviewStatus: conclusive ? "CONCLUSIVE" : "NON_CONCLUSIVE", reviewerNotes: judgment.note ?? null,
  }; });
};
