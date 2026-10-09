import { ImageModerationSurface, ImagePolicyCategory, ImagePolicyDecision } from "../imageModerationEvaluation.types";

export type SurfaceExpectation = Readonly<{ decision: ImagePolicyDecision; categories: readonly ImagePolicyCategory[] }>;
export type SurfaceExpectationState = Readonly<Record<ImageModerationSurface, SurfaceExpectation>>;

export const serializeExpectedBySurface = (enabled: boolean, values: Partial<SurfaceExpectationState>) => {
  if (!enabled) return undefined;
  const entries = Object.entries(values) as [ImageModerationSurface, SurfaceExpectation][];
  if (!entries.length) throw new Error("Select at least one surface-specific expectation");
  return Object.fromEntries(entries.map(([surface, expectation]) => {
    if (expectation.decision === "PASS") return [surface, { decision: "PASS" as const, categories: [] }];
    if (!expectation.categories.length) throw new Error(`${surface} ${expectation.decision} expectation requires a category`);
    return [surface, { decision: expectation.decision, categories: [...expectation.categories] }];
  })) as Partial<SurfaceExpectationState>;
};

export const restoreExpectedBySurface = (expectedBySurface?: Partial<SurfaceExpectationState>) => ({
  enabled: Boolean(expectedBySurface && Object.keys(expectedBySurface).length),
  values: expectedBySurface ? Object.fromEntries(Object.entries(expectedBySurface).map(([surface, expectation]) => [surface, {
    decision: expectation!.decision,
    categories: expectation!.decision === "PASS" ? [] : [...expectation!.categories],
  }])) as Partial<SurfaceExpectationState> : {},
});
