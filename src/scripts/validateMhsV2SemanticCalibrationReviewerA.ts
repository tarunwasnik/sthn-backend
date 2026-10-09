import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS,
  createMhsV2SemanticCalibrationCompletedReview,
  createMhsV2SemanticCalibrationReviewCertification,
  publishMhsV2SemanticCalibrationCompletedReview,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationReviewValidation";
import {
  MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationExecution";
import { MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME } from "../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";

const root = process.cwd();
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion/semantic-calibration");
const paths = {
  policy: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME),
  membership: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME),
  blinded: path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME),
};
const before = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))]));
const inputs = { policyBytes: fs.readFileSync(paths.policy), membershipBytes: fs.readFileSync(paths.membership), blindedCsv: fs.readFileSync(paths.blinded, "utf8"), judgments: MHS_V2_SEMANTIC_CALIBRATION_REVIEWER_A_JUDGMENTS };
const completedCsv = createMhsV2SemanticCalibrationCompletedReview(inputs);
const replayCsv = createMhsV2SemanticCalibrationCompletedReview(inputs);
if (completedCsv !== replayCsv) throw new Error("A1R-V completed review deterministic replay mismatch");
const certification = createMhsV2SemanticCalibrationReviewCertification(completedCsv, inputs);
const publication = publishMhsV2SemanticCalibrationCompletedReview(completedCsv, certification, outputDirectory);
let overwriteRefusal = false;
try { publishMhsV2SemanticCalibrationCompletedReview(completedCsv, certification, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) throw new Error("A1R-V second publication was not refused");
const after = Object.fromEntries(Object.entries(paths).map(([key, filename]) => [key, sha256(fs.readFileSync(filename))]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("A1R-V mutated a frozen upstream authority");
if (path.basename(publication.completedPath) !== MHS_V2_SEMANTIC_CALIBRATION_COMPLETED_FILENAME || path.basename(publication.certificationPath) !== MHS_V2_SEMANTIC_CALIBRATION_CERTIFICATION_FILENAME) throw new Error("A1R-V publication filename mismatch");
console.log(canonicalJson({ validationResult: "PASSED", ...publication, canonicalReviewPayloadDigest: certification.review.canonicalReviewPayloadDigest,
  certificationPayloadDigest: certification.certificationPayloadDigest, reviewer: certification.reviewer, rowCount: certification.review.rowCount,
  outcomeCounts: certification.review.outcomeCounts, reconciliation: certification.reconciliation, deterministicReplayMatched: true,
  overwriteRefusalVerified: overwriteRefusal, upstreamHashesBefore: before, upstreamHashesAfter: after, boundaries: certification.boundaries,
  nextAction: "AUTHORIZE_SEPARATE_POST_PUBLICATION_SEMANTIC_CALIBRATION_ANALYSIS_PHASE" }));
