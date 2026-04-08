//backend/src/services/moderationSeverity.service.ts

import { ModerationFlag } from "./aiModeration.service";

export type ModerationSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface SeverityResult {
  severity: ModerationSeverity;
  reasons: ModerationFlag[];
}

export const classifySeverity = (
  flags: ModerationFlag[],
  priorAbuseScore: number
): SeverityResult => {
  // Base severity from flags
  let severity: ModerationSeverity = "LOW";

  const hasContact =
    flags.includes("CONTACT_INTENT") ||
    flags.includes("PHONE_NUMBER") ||
    flags.includes("EMAIL");

  if (hasContact) severity = "MEDIUM";

  // Escalate based on history
  if (priorAbuseScore >= 3 && hasContact) {
    severity = "HIGH";
  }

  return {
    severity,
    reasons: flags,
  };
};