import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { createMhsV2SemanticCalibrationPolicy, MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES, MhsV2SemanticCalibrationAuthorityHashes, publishMhsV2SemanticCalibrationPolicy } from "../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), semanticRoot = path.resolve(root, "evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e");
const paths: Record<keyof MhsV2SemanticCalibrationAuthorityHashes, string> = {
  v2Candidate: path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidates-v1.json"), reviewUniverse: path.join(mhs, "expansion/review/mhs-v2-expansion-review-universe-v1.json"), operationalPlan: path.join(mhs, "expansion/review/mhs-v2-expansion-review-batch-plan-v1.json"), consolidation: path.join(mhs, "expansion/certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  e5Contract: path.resolve(root, "src/research/textModerationDataset/semanticSimilarity/E5_SMALL_SEMANTIC_CONTRACT.md"), e5ExportManifest: path.join(semanticRoot, "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json"), e5RuntimeCertification: path.join(semanticRoot, "certification/node-runtime-certification.json"),
  gSemanticAudit: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-semantic-audit.json"), hManifest: path.join(mhs, "semantic-review/mhs-semantic-review-v1-internal-manifest.json"), hValidated: path.join(mhs, "semantic-review/mhs-semantic-review-v1-validated-reviewer-a.json"), hAnalysis: path.join(mhs, "semantic-review/mhs-semantic-review-v1-precision-analysis.json"),
  jManifest: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-internal-manifest.json"), jValidated: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), jAnalysis: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-analysis.json"), lAuthorization: path.join(mhs, "semantic-review/mhs-semantic-review-floor-0.85-authorization-v1.json"), lReplay: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"),
  developmentProjectionManifest: path.join(mhs, "development/mhs-development-text-projection-manifest-v1.json"), developmentProjection: path.join(mhs, "development/mhs-development-text-projection-v1.jsonl"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreezeMetadata: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), frozen140Artifact: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts"),
};
const hashes = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))])) as unknown as MhsV2SemanticCalibrationAuthorityHashes;
if (canonicalJson(hashes) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES)) throw new Error("A1R-P protected input hash mismatch"); const before = { ...hashes };
const artifact = createMhsV2SemanticCalibrationPolicy(hashes), artifactPath = publishMhsV2SemanticCalibrationPolicy(artifact, path.join(mhs, "expansion/semantic-calibration"));
const after = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))])) as unknown as MhsV2SemanticCalibrationAuthorityHashes;
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("A1R-P mutated an upstream authority");
console.log(canonicalJson({ artifactPath, artifactSha256: sha256(fs.readFileSync(artifactPath)), policyPayloadDigest: artifact.policyPayloadDigest, searchScopes: artifact.searchScopes, reviewDesign: artifact.reviewDesign, upstreamHashesBefore: before, upstreamHashesAfter: after, nextAction: "STOP_AFTER_A1R_P; EXECUTION_REQUIRES_SEPARATE_AUTHORIZATION" }));
