import { ImageModerationEvaluationDetector } from "./imageModerationEvaluation.types";

/** Evaluation-only fixture-ID mapping. It performs no image recognition. */
export class DeterministicMockImageModerationDetector implements ImageModerationEvaluationDetector {
  readonly id = "STHN_IMAGE_EVALUATION_MOCK_V1"; readonly version = "1"; readonly displayName = "STHN deterministic image harness mock";
  readonly capabilities = ["NSFW", "NUDITY", "GORE", "TECHNICAL_QUALITY", "AI_GENERATED"] as const;
  getPerformanceMetadata() { return { modelArtifactBytes: 0 }; }
  async evaluate({ fixture, surface }: Parameters<ImageModerationEvaluationDetector["evaluate"]>[0]) {
    const expected = fixture.expectedBySurface[surface]!;
    return { status: "COMPLETED" as const, decision: expected.decision, findings: expected.categories.map((category, index) => ({ category, score: Number((0.91 - index * .1).toFixed(2)), severity: "HIGH" as const })) };
  }
}
