//backend/src/services/disputeWeighting.service.ts

export type DisputeOutcome = "FAVOR_USER" | "FAVOR_CREATOR" | "MANUAL_REVIEW";

export const decideDisputeOutcome = (
  severity: "LOW" | "MEDIUM" | "HIGH",
  abuseScore: number
): DisputeOutcome => {
  if (severity === "HIGH") return "FAVOR_CREATOR";
  if (severity === "MEDIUM" && abuseScore >= 10) return "FAVOR_CREATOR";
  if (severity === "LOW" && abuseScore < 5) return "FAVOR_USER";
  return "MANUAL_REVIEW";
};