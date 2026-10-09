import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_FILENAME } from "../research/textModerationDataset/mhsCandidateAdmission";
import { MHS_SEMANTIC_AUDIT_FILENAME } from "../research/textModerationDataset/mhsSemanticIntegrityAudit";
import {
  MHS_SEMANTIC_REVIEW_CSV_FILENAME, MHS_SEMANTIC_REVIEW_DIRECTORY, MHS_SEMANTIC_REVIEW_INSTRUCTIONS,
  MHS_SEMANTIC_REVIEW_INSTRUCTIONS_FILENAME, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME, MHS_SEMANTIC_REVIEW_SUMMARY_FILENAME,
  createMhsSemanticReviewCsv, createMhsSemanticReviewManifest, loadMhsSemanticReviewSources, selectMhsSemanticReviewPairs,
  summarizeMhsSemanticReviewPacket, validateMhsSemanticReviewManifest, validatePreparedMhsSemanticReviewCsv,
} from "../research/textModerationDataset/mhsSemanticReviewPacket";

const main = (): void => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const candidatePath = path.join(root, "candidates", MHS_CANDIDATE_ARTIFACT_FILENAME);
  const semanticPath = path.join(root, "candidates", MHS_SEMANTIC_AUDIT_FILENAME);
  const candidateBefore = fs.readFileSync(candidatePath); const semanticBefore = fs.readFileSync(semanticPath);
  const { semantic, candidate } = loadMhsSemanticReviewSources(semanticPath, candidatePath);
  const rows = selectMhsSemanticReviewPairs(semantic, candidate); const manifest = createMhsSemanticReviewManifest(rows);
  validateMhsSemanticReviewManifest(manifest); const csv = createMhsSemanticReviewCsv(rows); validatePreparedMhsSemanticReviewCsv(csv, manifest);
  const summary = summarizeMhsSemanticReviewPacket(manifest, csv); const output = path.join(root, MHS_SEMANTIC_REVIEW_DIRECTORY);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, MHS_SEMANTIC_REVIEW_CSV_FILENAME), csv, "utf8");
  fs.writeFileSync(path.join(output, MHS_SEMANTIC_REVIEW_MANIFEST_FILENAME), canonicalJson(manifest), "utf8");
  fs.writeFileSync(path.join(output, MHS_SEMANTIC_REVIEW_INSTRUCTIONS_FILENAME), MHS_SEMANTIC_REVIEW_INSTRUCTIONS, "utf8");
  fs.writeFileSync(path.join(output, MHS_SEMANTIC_REVIEW_SUMMARY_FILENAME), canonicalJson(summary), "utf8");
  if (sha256(fs.readFileSync(candidatePath)) !== sha256(candidateBefore) || sha256(fs.readFileSync(semanticPath)) !== sha256(semanticBefore)) throw new Error("Semantic packet preparation mutated a source artifact");
  console.log(canonicalJson(summary));
};

main();
