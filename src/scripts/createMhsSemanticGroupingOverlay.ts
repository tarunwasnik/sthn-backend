import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { createMhsSemanticGroupingOverlay } from "../research/textModerationDataset/mhsSemanticGroupingOverlay";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const candidates = path.join(root, "candidates"); const review = path.join(root, "semantic-review");
  const paths = { candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
    currentSemanticAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"), hValidatedPath: path.join(review, "mhs-semantic-review-v1-validated-reviewer-a.json"),
    jValidatedPath: path.join(review, "mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), lAuthorizationPath: path.join(review, "mhs-semantic-review-floor-0.85-authorization-v1.json"),
    mApplicationContractPath: path.join(review, "mhs-reviewed-semantic-application-contract-v1.json") };
  const before = new Map(Object.values(paths).map((filename) => [filename, sha256(fs.readFileSync(filename))])); const result = createMhsSemanticGroupingOverlay({ ...paths, outputDirectory: review });
  for (const filename of Object.values(paths)) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Grouping overlay mutated authority: ${filename}`);
  console.log(canonicalJson({ artifactPath: result.artifactPath, artifactSha256: result.artifactSha256, overlayPayloadDigest: result.artifact.overlayPayloadDigest,
    decision: result.artifact.decision, appliedEdgeCount: result.artifact.appliedEdges.length, components: result.artifact.components }));
};
main();
