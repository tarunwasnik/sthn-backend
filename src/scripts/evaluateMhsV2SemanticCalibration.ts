import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME,
  createMhsV2SemanticCalibrationEvaluation, createMhsV2SemanticCalibrationEvaluationCertification,
  publishMhsV2SemanticCalibrationEvaluation,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationEvaluation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationExecution";
import { MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME } from "../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationReviewValidation";

const root = process.cwd(), outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration");
const semanticRoot = path.resolve(root, "evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e");
const paths = { policy: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME), membership: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME), blinded: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME), completed: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME), reviewCertification: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME), e5Contract: path.resolve(root, "src/research/textModerationDataset/semanticSimilarity/E5_SMALL_SEMANTIC_CONTRACT.md"), e5ExportManifest: path.join(semanticRoot, "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json"), e5RuntimeCertification: path.join(semanticRoot, "certification/node-runtime-certification.json") };
const before = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))]));
const inputs = { policyBytes: fs.readFileSync(paths.policy), membershipBytes: fs.readFileSync(paths.membership), blindedCsv: fs.readFileSync(paths.blinded, "utf8"), completedCsv: fs.readFileSync(paths.completed, "utf8"), reviewCertificationBytes: fs.readFileSync(paths.reviewCertification), e5ContractBytes: fs.readFileSync(paths.e5Contract), e5ExportManifestBytes: fs.readFileSync(paths.e5ExportManifest), e5RuntimeCertificationBytes: fs.readFileSync(paths.e5RuntimeCertification) };
const evaluation = createMhsV2SemanticCalibrationEvaluation(inputs), replay = createMhsV2SemanticCalibrationEvaluation(inputs);
if (canonicalJson(evaluation) !== canonicalJson(replay)) throw new Error("A1R-E deterministic replay mismatch");
const certification = createMhsV2SemanticCalibrationEvaluationCertification(evaluation), publication = publishMhsV2SemanticCalibrationEvaluation(evaluation, certification, outputDirectory);
let overwriteRefusalVerified = false;
try { publishMhsV2SemanticCalibrationEvaluation(evaluation, certification, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusalVerified = true; else throw error; }
if (!overwriteRefusalVerified) throw new Error("A1R-E second publication was not refused");
const after = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))])); if (canonicalJson(before) !== canonicalJson(after)) throw new Error("A1R-E mutated a frozen authority");
if (path.basename(publication.evaluationPath) !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_FILENAME || path.basename(publication.certificationPath) !== MHS_V2_SEMANTIC_CALIBRATION_EVALUATION_CERTIFICATION_FILENAME) throw new Error("A1R-E publication filename mismatch");
console.log(canonicalJson({ validationResult: "PASSED", ...publication, evaluationPayloadDigest: evaluation.evaluationPayloadDigest, certificationPayloadDigest: certification.certificationPayloadDigest, joinedRowCount: evaluation.joinedRowCount, joinIntegrity: evaluation.joinIntegrity, outcomeCounts: evaluation.outcomeCounts, duplicateLikeTotal: evaluation.duplicateLikeTotal, byScope: evaluation.byScope, bySamplingStratum: evaluation.bySamplingStratum, byScopeAndSamplingStratum: evaluation.byScopeAndSamplingStratum, duplicateLikePairs: evaluation.duplicateLikePairs, below0_85: evaluation.below0_85, minimumObservedDuplicateLike: evaluation.minimumObservedDuplicateLike, policyConclusion: evaluation.policyConclusion, deterministicReplayMatched: true, overwriteRefusalVerified, upstreamHashesBefore: before, upstreamHashesAfter: after, boundaries: evaluation.boundaries, nextAction: "AUTHORIZE_A_SEPARATE_BOUNDED_CONSEQUENCE_PHASE_WITHOUT_NEW_HUMAN_DATA" }));
