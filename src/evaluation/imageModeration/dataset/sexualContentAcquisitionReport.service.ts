import { AcquisitionManifest, acquisitionSummary } from "./sexualContentAcquisition.service";
import { CoverageClass } from "./sexualContentBenchmark.types";

export const sexualContentAcquisitionTargets: Readonly<Record<CoverageClass, number>> = {
  ORDINARY_PORTRAIT_PASS: 5, PROFESSIONAL_PORTRAIT_PASS: 4, FITNESS_PASS: 5, ATHLETIC_PASS: 4,
  SWIMWEAR_PASS: 6, BEACH_PASS: 4, SHIRTLESS_NONSEXUAL_PASS: 4, FASHION_PASS: 5,
  COUPLE_GROUP_PASS: 4, NONSEXUAL_ILLUSTRATION_PASS: 4, NONAVATAR_GENERATED_PASS: 3,
  NUDITY_BLOCK: 3, EXPLICIT_SEXUAL_BLOCK: 3, PORNOGRAPHY_BLOCK: 3, SUGGESTIVE_BLOCK: 4,
  SEXUAL_ILLUSTRATION_BLOCK: 3, GENERATED_SEXUAL_BLOCK: 3, BOUNDARY_UNCERTAIN: 3,
};

export const analyzeSexualContentAcquisition = (manifest: AcquisitionManifest) => {
  const summary = acquisitionSummary(manifest);
  const coverage = Object.entries(sexualContentAcquisitionTargets).map(([coverageClass, target]) => {
    const current = summary.byCoverage[coverageClass] ?? 0;
    return { coverageClass: coverageClass as CoverageClass, target, reviewRequiredCandidates: current, gap: Math.max(0, target - current) };
  });
  return { schemaVersion: manifest.schemaVersion, candidateSummary: summary, coverage, reviewRequiredCandidatesAreNotOfficialEvidence: true };
};

export const renderSexualContentAcquisitionMarkdown = (analysis: ReturnType<typeof analyzeSexualContentAcquisition>) => `# STHN Sexual-Content Acquisition Pool\n\n- Candidate records: ${analysis.candidateSummary.total}\n- Valid review-required candidates: ${analysis.candidateSummary.reviewRequired}\n- These candidates are **not** approved model-quality benchmark evidence.\n\n## Candidate composition\n\n${Object.entries(analysis.candidateSummary.bySource).map(([source, count]) => `- ${source}: ${count}`).join("\n")}\n\n## Coverage gaps for review pool\n\n| Coverage class | Target | Review-required candidates | Gap |\n| --- | ---: | ---: | ---: |\n${analysis.coverage.map((item) => `| ${item.coverageClass} | ${item.target} | ${item.reviewRequiredCandidates} | ${item.gap} |`).join("\n")}\n`;
