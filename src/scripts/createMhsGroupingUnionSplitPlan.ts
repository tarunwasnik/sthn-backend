import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { createMhsGroupingUnionSplitPlan } from "../research/textModerationDataset/mhsGroupingUnionSplitPlan";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates"); const review = path.join(root, "semantic-review"); const grouping = path.join(root, "grouping");
const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  currentSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"), mApplicationContractPath: path.join(review, "mhs-reviewed-semantic-application-contract-v1.json"),
  nSemanticOverlayPath: path.join(review, "mhs-semantic-grouping-overlay-v1.json") };
const before = new Map(Object.values(paths).map((filename) => [filename, sha256(fs.readFileSync(filename))])); const result = createMhsGroupingUnionSplitPlan({ ...paths, outputDirectory: grouping });
for (const filename of Object.values(paths)) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Grouping plan mutated authority: ${filename}`);
console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256, payloadDigest: result.artifact.planningPayloadDigest, graphSummary: result.artifact.graphSummary,
  edgeTypeSummary: result.artifact.edgeTypeSummary, contradictionAudit: result.artifact.contradictionAudit, dryRunPlans: result.artifact.targetRatioEvaluations.map((p) => ({ ratio: p.ratio, target: p.targetCandidateCounts, achieved: p.achievedCandidateCounts, components: p.componentAssignmentCounts })), recommendation: result.artifact.recommendedFutureSplitStrategy }));
