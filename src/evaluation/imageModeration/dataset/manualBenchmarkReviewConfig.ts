import { CoverageClass, SexualContentContextTag } from "./sexualContentBenchmark.types";
export const manualBenchmarkReviewConfig = {
  policyVersion: "V1",
  license: "STHN private local evaluation benchmark",
  defaultDifficulty: "EASY" as const,
  prominentCategories: ["NUDITY", "PORNOGRAPHY", "SEXUAL_CONTENT", "SUGGESTIVE", "AI_GENERATED_PERSON"] as const,
  advancedCategories: ["HENTAI", "GENERATED_SEXUAL"] as const,
  advancedTags: ["ANIME", "DRAWING"] as const,
  rationaleTemplates: ["Straightforward reviewed benchmark fixture.", "Clear policy-relevant sexual-content benchmark fixture."] as const,
  coverageClasses: [] as readonly CoverageClass[],
  contextTags: ["PORTRAIT", "PROFESSIONAL", "FITNESS", "ATHLETIC", "BEACH", "SWIMWEAR", "SHIRTLESS", "FASHION", "COUPLE", "GROUP", "ANIME", "DRAWING", "AI_GENERATED", "SUGGESTIVE_BOUNDARY", "EXPLICIT_BOUNDARY"] as const satisfies readonly SexualContentContextTag[],
} as const;
