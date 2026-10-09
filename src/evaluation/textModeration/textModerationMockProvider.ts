import {
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "./textModerationEvaluation.types";

const numericId = (fixture: TextModerationEvaluationFixture) => {
  const match = fixture.id.match(/(\d+)$/);
  return match ? Number(match[1]) : 1;
};

/**
 * Harness-only evaluator. It deliberately emits occasional mistakes and failures
 * from stable fixture IDs so every report section is exercised deterministically.
 */
export class DeterministicMockTextModerationProvider implements TextModerationEvaluationProvider {
  readonly id = "STHN_DETERMINISTIC_MOCK_V1";
  readonly displayName = "STHN deterministic harness mock";

  async evaluate(fixture: TextModerationEvaluationFixture) {
    const value = numericId(fixture);
    if (value % 37 === 0) {
      return {
        status: "UNAVAILABLE" as const,
        errorCode: "MOCK_UNAVAILABLE",
        raw: { summary: "Synthetic provider availability fixture" },
      };
    }
    if (value % 41 === 0) throw new Error("Synthetic provider error fixture");
    const intentionallyIncorrect = value % 17 === 0;
    const decision = intentionallyIncorrect
      ? (fixture.expectedDecision === "ALLOW" ? "BLOCK" : "ALLOW")
      : fixture.expectedDecision;
    return {
      status: "COMPLETED" as const,
      decision,
      categories: decision === "BLOCK"
        ? [fixture.expectedCategory ?? "OTHER_INAPPROPRIATE" as const]
        : [],
      raw: {
        summary: intentionallyIncorrect ? "Synthetic disagreement" : "Synthetic agreement",
        metadata: { rule: intentionallyIncorrect ? "ID_MOD_17" : "EXPECTED_LABEL_PROOF" },
      },
    };
  }
}
