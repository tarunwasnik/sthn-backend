import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  createMhsV2CollisionAnalysis,
  createMhsV2CollisionCertification,
  createMhsV2CollisionPolicy,
  publishMhsV2CollisionAuthority,
} from "../research/textModerationDataset/mhsV2HistoricalSplitAnchorCollision";
import {
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationEvaluation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationExecution";
import { MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME } from "../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationReviewValidation";

const root = process.cwd();
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration");
const mhsRoot = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const semanticRoot = path.resolve(root, "evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e");
const paths = {
  policy: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME),
  membership: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME),
  blinded: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME),
  completed: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME),
  reviewCertification: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME),
  evaluation: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME),
  evaluationCertification: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME),
  consolidation: path.join(mhsRoot, "expansion/certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  splitManifest: path.join(mhsRoot, "splits/mhs-split-manifest-v1.json"),
  internalTestFreeze: path.join(mhsRoot, "splits/mhs-internal-test-freeze-v1.json"),
  e5Contract: path.resolve(root, "src/research/textModerationDataset/semanticSimilarity/E5_SMALL_SEMANTIC_CONTRACT.md"),
  e5ExportManifest: path.join(semanticRoot, "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json"),
  e5RuntimeCertification: path.join(semanticRoot, "certification/node-runtime-certification.json"),
};
const before = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))]));
const evaluationInputs = { policyBytes: fs.readFileSync(paths.policy), membershipBytes: fs.readFileSync(paths.membership), blindedCsv: fs.readFileSync(paths.blinded, "utf8"), completedCsv: fs.readFileSync(paths.completed, "utf8"), reviewCertificationBytes: fs.readFileSync(paths.reviewCertification), e5ContractBytes: fs.readFileSync(paths.e5Contract), e5ExportManifestBytes: fs.readFileSync(paths.e5ExportManifest), e5RuntimeCertificationBytes: fs.readFileSync(paths.e5RuntimeCertification) };
const inputs = { evaluationInputs, evaluationBytes: fs.readFileSync(paths.evaluation), evaluationCertificationBytes: fs.readFileSync(paths.evaluationCertification), consolidationBytes: fs.readFileSync(paths.consolidation), historicalSplitManifestBytes: fs.readFileSync(paths.splitManifest), internalTestFreezeMetadataBytes: fs.readFileSync(paths.internalTestFreeze) };
const policy = createMhsV2CollisionPolicy(inputs), analysis = createMhsV2CollisionAnalysis(inputs), certification = createMhsV2CollisionCertification(policy, analysis);
const replay = { policy: createMhsV2CollisionPolicy(inputs), analysis: createMhsV2CollisionAnalysis(inputs) };
const replayCertification = createMhsV2CollisionCertification(replay.policy, replay.analysis);
if (canonicalJson(policy) !== canonicalJson(replay.policy) || canonicalJson(analysis) !== canonicalJson(replay.analysis) || canonicalJson(certification) !== canonicalJson(replayCertification)) throw new Error("A1R-CQ deterministic replay mismatch");
const publication = publishMhsV2CollisionAuthority(policy, analysis, certification, outputDirectory);
let overwriteRefusalVerified = false;
try { publishMhsV2CollisionAuthority(policy, analysis, certification, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusalVerified = true; else throw error; }
if (!overwriteRefusalVerified) throw new Error("A1R-CQ second publication was not refused");
const after = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("A1R-CQ mutated a frozen upstream authority");
console.log(canonicalJson({ validationResult: "PASSED", ...publication, policyPayloadDigest: policy.policyPayloadDigest, analysisPayloadDigest: analysis.analysisPayloadDigest, certificationPayloadDigest: certification.certificationPayloadDigest, collisionGroupCount: analysis.collisionGroupCount, conflictingCandidateIds: analysis.constraints.filter((constraint) => constraint.collision).map((constraint) => constraint.v2CandidateId), constraints: analysis.constraints, disposition: certification.result.disposition, reasonCode: certification.result.reasonCode, deterministicReplayMatched: true, overwriteRefusalVerified, upstreamHashesBefore: before, upstreamHashesAfter: after, findings: analysis.findings, nextAction: "T6L-7K-A1R-C-R" }));
