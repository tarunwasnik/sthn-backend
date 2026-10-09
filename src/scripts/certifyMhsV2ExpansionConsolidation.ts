import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "../research/textModerationDataset/mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "../research/textModerationDataset/mhsInternalTestFreeze";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "../research/textModerationDataset/mhsTrainingEligibilityReleasePlan";
import {
  createMhsV2ExpansionConsolidation, MhsV2ConsolidationBatchAuthority, publishMhsV2ExpansionConsolidation,
} from "../research/textModerationDataset/mhsV2ExpansionConsolidation";
import {
  MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_SHA256,
  MhsV2ExpansionAcquisitionArtifact, MhsV2ExpansionCandidateArtifact,
} from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_HUMAN_PII_FINAL_SHA256, MhsV2HumanPiiFinalArtifact,
} from "../research/textModerationDataset/mhsV2ExpansionHumanPiiDisposition";
import * as review from "../research/textModerationDataset/mhsV2ExpansionReviewerA";

const root = process.cwd();
const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion"), reviewDirectory = path.join(expansion, "review");
const paths = {
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"),
  acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"),
  privacy: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"),
  universe: path.join(reviewDirectory, review.MHS_V2_REVIEW_UNIVERSE_FILENAME),
  plan: path.join(reviewDirectory, review.MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  split: path.join(mhs, "splits/mhs-split-manifest-v1.json"),
  internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
  existingV1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"),
  frozenExternalBenchmark: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts"),
};
const shaFile = (filename: string): string => sha256(fs.readFileSync(filename));
const readJson = <T>(filename: string): T => JSON.parse(fs.readFileSync(filename, "utf8")) as T;
const assertHash = (filename: string, expected: string): void => { if (shaFile(filename) !== expected) throw new Error(`T6L-7J protected authority SHA mismatch: ${path.basename(filename)}`); };

assertHash(paths.candidate, MHS_V2_EXPANSION_CANDIDATE_SHA256);
assertHash(paths.acquisition, MHS_V2_EXPANSION_ACQUISITION_SHA256);
assertHash(paths.privacy, MHS_V2_HUMAN_PII_FINAL_SHA256);
assertHash(paths.universe, review.MHS_V2_REVIEW_UNIVERSE_SHA256);
assertHash(paths.plan, review.MHS_V2_REVIEW_BATCH_PLAN_SHA256);
assertHash(paths.split, MHS_SPLIT_MANIFEST_SHA256);
assertHash(paths.internalTestFreeze, MHS_INTERNAL_TEST_FREEZE_SHA256);
assertHash(paths.existingV1Candidate, MHS_CANDIDATE_ARTIFACT_SHA256);
assertHash(paths.frozenExternalBenchmark, "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747");

const constants = review as unknown as Readonly<Record<string, string>>;
const batchAuthorities: MhsV2ConsolidationBatchAuthority[] = [];
const protectedPaths = [...Object.values(paths)];
for (let batchNumber = 1; batchNumber <= 10; batchNumber += 1) {
  const digits = String(batchNumber).padStart(2, "0"), directory = path.join(reviewDirectory, `batch-${digits}`);
  const packet = path.join(directory, review.batchPacketFilename(batchNumber));
  const template = path.join(directory, review.batchTemplateFilename(batchNumber));
  const completed = path.join(directory, `mhs-v2-expansion-review-decisions-batch-${digits}-v1-completed.csv`);
  const validated = path.join(directory, review.batchImportFilename(batchNumber));
  const prefix = `MHS_V2_REVIEW_BATCH_${digits}`;
  const expected = [constants[`${prefix}_PACKET_SHA256`], constants[`${prefix}_TEMPLATE_SHA256`], constants[`${prefix}_COMPLETED_INPUT_SHA256`], constants[`${prefix}_IMPORT_SHA256`]];
  if (expected.some((value) => !value)) throw new Error(`Missing pinned Batch ${batchNumber} authority constant`);
  [packet, template, completed, validated].forEach((filename, index) => assertHash(filename, expected[index]));
  protectedPaths.push(packet, template, completed, validated);
  batchAuthorities.push({ batchNumber, packetSha256: expected[0], blankTemplateSha256: expected[1], completedInputSha256: expected[2], validatedImportSha256: expected[3], artifact: readJson<review.MhsV2ReviewBatchImportArtifact>(validated) });
}

const before = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), shaFile(filename)]));
const candidate = readJson<MhsV2ExpansionCandidateArtifact>(paths.candidate), acquisition = readJson<MhsV2ExpansionAcquisitionArtifact>(paths.acquisition);
const privacy = readJson<MhsV2HumanPiiFinalArtifact>(paths.privacy), universe = readJson<review.MhsV2ReviewUniverseArtifact>(paths.universe), plan = readJson<review.MhsV2ReviewBatchPlanArtifact>(paths.plan);
const split = readJson<{ readonly candidateMembershipIndex: readonly { readonly candidateId: string }[] }>(paths.split);
const artifact = createMhsV2ExpansionConsolidation({ candidate, acquisition, privacy, universe, plan, batchAuthorities,
  authorities: { candidateArtifactSha256: shaFile(paths.candidate), acquisitionArtifactSha256: shaFile(paths.acquisition), privacyDispositionArtifactSha256: shaFile(paths.privacy),
    reviewUniverseArtifactSha256: shaFile(paths.universe), operationalPlanArtifactSha256: shaFile(paths.plan), splitManifestSha256: shaFile(paths.split),
    internalTestFreezeMetadataSha256: shaFile(paths.internalTestFreeze), frozenExternalBenchmarkArtifactSha256: shaFile(paths.frozenExternalBenchmark), existingV1CandidateArtifactSha256: shaFile(paths.existingV1Candidate) },
  existingSplitCandidateIds: new Set(split.candidateMembershipIndex.map((row) => row.candidateId)) });
const output = publishMhsV2ExpansionConsolidation(artifact, path.join(expansion, "certification"));
const after = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), shaFile(filename)]));
if (canonicalJson(before) !== canonicalJson(after)) throw new Error("T6L-7J protected authority changed during publication");
console.log(JSON.stringify({ artifactPath: output, artifactSha256: shaFile(output), certificationPayloadDigest: artifact.certificationPayloadDigest,
  membershipDigest: artifact.membershipDigest, reviewerAuthorityDigest: artifact.reviewerAuthorityDigest, summary: artifact.summary,
  annotationCertification: artifact.annotationCertification, leakageCertification: artifact.leakageCertification, progressionCertification: artifact.progressionCertification,
  protectedArtifactCount: protectedPaths.length, upstreamHashesBefore: before, upstreamHashesAfter: after,
  nextAction: "STOP_AFTER_T6L_7J; NO_BATCH_11; V2_LEAKAGE_COMPONENT_CONTAMINATION_AND_RELEASE_AUTHORITIES_REQUIRED_BEFORE_SPLIT_USE" }, null, 2));
