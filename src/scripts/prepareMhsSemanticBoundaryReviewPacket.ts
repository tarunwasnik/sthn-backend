import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import { MHS_SEMANTIC_REVIEW_DIRECTORY, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME } from "../research/textModerationDataset/mhsSemanticReviewPacket";
import { MHS_SEMANTIC_PRECISION_FILENAME, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME } from "../research/textModerationDataset/mhsSemanticReviewValidation";
import {
  MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME, MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS_FILENAME,
  MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME, MHS_SEMANTIC_BOUNDARY_SUMMARY_FILENAME, createMhsSemanticBoundaryCsv,
  createMhsSemanticBoundaryManifest, loadMhsSemanticBoundarySources, selectMhsSemanticBoundaryPairs,
  summarizeMhsSemanticBoundaryPacket, validateMhsSemanticBoundaryManifest, validatePreparedMhsSemanticBoundaryCsv,
} from "../research/textModerationDataset/mhsSemanticBoundaryReviewPacket";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH"); const review = path.join(root, MHS_SEMANTIC_REVIEW_DIRECTORY);
  const sourcePaths = { semanticPath: path.join(root, "candidates", MHS_SEMANTIC_AUDIT_FILENAME), candidatePath: path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME),
    hManifestPath: path.join(review, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME), iValidatedPath: path.join(review, MHS_SEMANTIC_VALIDATED_REVIEW_FILENAME), iPrecisionPath: path.join(review, MHS_SEMANTIC_PRECISION_FILENAME) };
  const before = new Map(Object.values(sourcePaths).map((filename) => [filename, sha256(fs.readFileSync(filename))])); const sources = loadMhsSemanticBoundarySources(sourcePaths);
  const rows = selectMhsSemanticBoundaryPairs(sources); const manifest = createMhsSemanticBoundaryManifest(rows, sources.hManifest); validateMhsSemanticBoundaryManifest(manifest);
  const csv = createMhsSemanticBoundaryCsv(rows); validatePreparedMhsSemanticBoundaryCsv(csv, manifest); const summary = summarizeMhsSemanticBoundaryPacket(manifest, csv);
  fs.writeFileSync(path.join(review, MHS_SEMANTIC_BOUNDARY_BLINDED_FILENAME), csv, "utf8");
  fs.writeFileSync(path.join(review, MHS_SEMANTIC_BOUNDARY_MANIFEST_FILENAME), canonicalJson(manifest), "utf8");
  fs.writeFileSync(path.join(review, MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS_FILENAME), MHS_SEMANTIC_BOUNDARY_INSTRUCTIONS, "utf8");
  fs.writeFileSync(path.join(review, MHS_SEMANTIC_BOUNDARY_SUMMARY_FILENAME), canonicalJson(summary), "utf8");
  for (const filename of Object.values(sourcePaths)) if (sha256(fs.readFileSync(filename)) !== before.get(filename)) throw new Error(`Boundary packet preparation mutated source: ${filename}`);
  console.log(canonicalJson(summary));
};

main();
