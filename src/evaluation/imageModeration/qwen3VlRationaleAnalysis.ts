export const QWEN3_VL_RATIONALE_ANALYZER_VERSION = "STHN_QWEN3_VL_RATIONALE_ANALYZER_V1";
export type EvidenceStatus = "EXPLICIT_POSITIVE" | "EXPLICIT_NEGATIVE" | "CONTRADICTORY" | "UNKNOWN";
export type Finding = "NUDITY" | "SEXUAL_ACTIVITY" | "PORNOGRAPHY";
export interface RationaleEvidence { readonly finding: Finding; readonly status: EvidenceStatus; readonly spans: readonly string[]; }
const terms: Readonly<Record<Finding, string>> = { NUDITY: "(?:nude|nudity|naked|genitals?|bare breasts?)", SEXUAL_ACTIVITY: "(?:sexual activity|sex(?:ual)? act|intercourse|penetration)", PORNOGRAPHY: "(?:pornography|pornographic|porn)" };
const clip = (value: string) => value.trim().slice(0, 280);
const sentenceSpans = (text: string, expression: RegExp) => text.split(/(?<=[.!?])\s+/).filter((sentence) => expression.test(sentence)).map(clip);
/** Conservative linguistic evidence only; it makes no claim about the actual pixels. */
export const extractQwenRationaleEvidence = (rationale: string): readonly RationaleEvidence[] => (Object.entries(terms) as [Finding, string][]).map(([finding, term]) => {
  const negativePattern = `\\b(?:no|not|without|lacks?|does not contain|isn't|aren't)\\b[^.!?]{0,70}${term}`;
  const negative = sentenceSpans(rationale, new RegExp(negativePattern, "i"));
  // A phrase such as “no nudity is visible” must not satisfy the positive “nudity ... visible” form.
  const positiveFromDescription = sentenceSpans(rationale, new RegExp(`\\b(?:shows?|depicts?|visible|contains?|features?)\\b[^.!?]{0,90}${term}|${term}[^.!?]{0,90}\\b(?:is|are|visible|shown|present)\\b`, "i")).filter((span) => !new RegExp(negativePattern, "i").test(span));
  // “The subject is nude, but no nudity is visible” is internally contradictory;
  // retain the direct affirmative clause so the contradiction is visible to reviewers.
  const directPositive = sentenceSpans(rationale, new RegExp(`\\b(?:is|are)\\s+${term}`, "i"));
  const positive = [...new Set([...positiveFromDescription, ...directPositive])];
  const status: EvidenceStatus = positive.length && negative.length ? "CONTRADICTORY" : positive.length ? "EXPLICIT_POSITIVE" : negative.length ? "EXPLICIT_NEGATIVE" : "UNKNOWN";
  return { finding, status, spans: [...positive, ...negative] };
});
export const counterfactualDecision = (evidence: readonly RationaleEvidence[]) => {
  const contradictory = evidence.some((item) => item.status === "CONTRADICTORY"); const positives = evidence.filter((item) => item.status === "EXPLICIT_POSITIVE");
  return contradictory ? "UNKNOWN" as const : positives.length ? "DIAGNOSTIC_BLOCK" as const : "UNKNOWN" as const;
};
