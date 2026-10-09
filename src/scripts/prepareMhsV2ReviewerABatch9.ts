import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { MhsV2ExpansionCandidateArtifact } from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import { MhsV2HumanPiiFinalArtifact, validateMhsV2HumanPiiFinalDisposition } from "../research/textModerationDataset/mhsV2ExpansionHumanPiiDisposition";
import * as authority from "../research/textModerationDataset/mhsV2ExpansionReviewerA";

const root = process.cwd();
const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion");
const review = path.join(expansion, "review");
const batch = (number: number): string => path.join(review, `batch-${String(number).padStart(2, "0")}`);
const completed = (number: number): string => path.join(batch(number), `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1-completed.csv`);
const paths: Record<string, string> = {
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"),
  proposal: path.join(expansion, "mhs-train-expansion-tranche-proposal-v1.json"),
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"),
  acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"),
  policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"),
  screening: path.join(expansion, "pii/mhs-v2-expansion-pii-screening-v1.json"),
  automaticDisposition: path.join(expansion, "pii/mhs-v2-expansion-pii-disposition-v1.json"),
  completedPrivacyInput: path.join(expansion, "pii/mhs-v2-expansion-human-pii-decisions-v1-completed.csv"),
  privacyDisposition: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"),
  v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"),
  splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"),
  internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
  universe: path.join(review, authority.MHS_V2_REVIEW_UNIVERSE_FILENAME),
  plan: path.join(review, authority.MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap((number) => [
    [`batch${number}Packet`, path.join(batch(number), authority.batchPacketFilename(number))],
    [`batch${number}Template`, path.join(batch(number), authority.batchTemplateFilename(number))],
    [`batch${number}Completed`, completed(number)],
    [`batch${number}Import`, path.join(batch(number), authority.batchImportFilename(number))],
  ])),
};

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const assertHash = (filename: string, expected: string): void => {
  if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 Batch 9 preparation authority mismatch: ${path.basename(filename)}`);
};

authority.assertMhsV2ReviewAuthorityHashes(paths as unknown as authority.MhsV2ReviewAuthorityPaths);
assertHash(paths.universe, authority.MHS_V2_REVIEW_UNIVERSE_SHA256);
assertHash(paths.plan, authority.MHS_V2_REVIEW_BATCH_PLAN_SHA256);
const predecessorHashes: readonly (readonly [string, string, string, string])[] = [
  [authority.MHS_V2_REVIEW_BATCH_01_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_01_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_01_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_01_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_02_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_02_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_02_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_02_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_03_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_03_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_03_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_03_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_04_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_04_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_04_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_04_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_05_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_05_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_05_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_06_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_06_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_06_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_06_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_07_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_07_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_07_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_07_IMPORT_SHA256],
  [authority.MHS_V2_REVIEW_BATCH_08_PACKET_SHA256, authority.MHS_V2_REVIEW_BATCH_08_TEMPLATE_SHA256, authority.MHS_V2_REVIEW_BATCH_08_COMPLETED_INPUT_SHA256, authority.MHS_V2_REVIEW_BATCH_08_IMPORT_SHA256],
];
predecessorHashes.forEach((hashes, index) => {
  const number = index + 1;
  ["Packet", "Template", "Completed", "Import"].forEach((suffix, item) => assertHash(paths[`batch${number}${suffix}`], hashes[item]));
});
if (fs.existsSync(batch(9))) throw new Error("Batch 9 material already exists; preparation refused");

const protectedPaths = Object.values(paths);
const beforeHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact;
const privacy = JSON.parse(fs.readFileSync(paths.privacyDisposition, "utf8")) as MhsV2HumanPiiFinalArtifact;
const universe = JSON.parse(fs.readFileSync(paths.universe, "utf8")) as authority.MhsV2ReviewUniverseArtifact;
const plan = JSON.parse(fs.readFileSync(paths.plan, "utf8")) as authority.MhsV2ReviewBatchPlanArtifact;
validateMhsV2HumanPiiFinalDisposition(privacy);
authority.validateMhsV2ReviewUniverse(universe);
authority.validateMhsV2ReviewBatchPlan(plan, universe);

const priorPackets = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => JSON.parse(fs.readFileSync(paths[`batch${number}Packet`], "utf8")) as authority.MhsV2ReviewBatchPacketArtifact);
const priorImports = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => JSON.parse(fs.readFileSync(paths[`batch${number}Import`], "utf8")) as authority.MhsV2ReviewBatchImportArtifact);
priorPackets.forEach((prior, index) => {
  authority.validateMhsV2ReviewBatchPacket(prior, universe, candidate);
  authority.validateBlankMhsV2ReviewDecisionTemplate(fs.readFileSync(paths[`batch${index + 1}Template`], "utf8"), prior);
});
priorImports.forEach(authority.validateMhsV2ReviewBatchImport);
if (priorImports[7].payloadIntegrityDigest !== authority.MHS_V2_REVIEW_BATCH_08_IMPORT_PAYLOAD_DIGEST || priorImports[7].membershipDigest !== authority.MHS_V2_REVIEW_BATCH_08_MEMBERSHIP_DIGEST) throw new Error("Batch 8 completion payload or membership authority mismatch");

const planned = plan.batches[8];
if (!planned || planned.batchId !== "MHS_V2_REVIEW_BATCH_09_V1" || planned.startOrdinal !== 311 || planned.endOrdinal !== 355 || planned.memberCount !== 45) throw new Error("Frozen operational plan does not authorize Batch 9 positions 311-355");
const packet = authority.createMhsV2ReviewBatchPacket(universe, candidate, 9);
const template = authority.createBlankMhsV2ReviewDecisionTemplate(packet);
const privacyById = new Map(privacy.finalRows.map((row) => [row.candidateId, row]));
const priorIds = new Set(priorPackets.flatMap((prior) => prior.rows.map((row) => row.candidateId)));
const intersectionCounts = Object.fromEntries(priorPackets.map((prior) => {
  const ids = new Set(prior.rows.map((row) => row.candidateId));
  return [`batch${prior.batchNumber}`, packet.rows.filter((row) => ids.has(row.candidateId)).length];
}));
const privacyClearedCount = packet.rows.filter((row) => {
  const disposition = privacyById.get(row.candidateId);
  return disposition?.reviewDisposition === "ELIGIBLE_FOR_REVIEW" && disposition.textSha256 === row.textSha256;
}).length;
const candidateIds = new Set(packet.rows.map((row) => row.candidateId));
const textHashes = new Set(packet.rows.map((row) => row.textSha256));
if (packet.batchId !== planned.batchId || packet.batchNumber !== 9 || packet.memberCount !== 45 || packet.rows.length !== 45 || candidateIds.size !== 45 || textHashes.size !== 45 || packet.membershipDigest !== planned.membershipDigest || packet.rows[0]?.candidateId !== universe.members[310]?.candidateId || packet.rows[44]?.candidateId !== universe.members[354]?.candidateId || packet.rows.some((row) => priorIds.has(row.candidateId)) || privacyClearedCount !== 45) throw new Error("Batch 9 positional, uniqueness, intersection, binding, or privacy invariant mismatch");
authority.validateBlankMhsV2ReviewDecisionTemplate(template, packet);
const published = authority.publishMhsV2ReviewBatchMaterials(universe, candidate, packet, template, review);
const afterHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
if (canonicalJson(beforeHashes) !== canonicalJson(afterHashes)) throw new Error("Protected authority changed during Batch 9 preparation");
console.log(JSON.stringify({ ...published, batchId: packet.batchId, batchNumber: packet.batchNumber, startOrdinal: planned.startOrdinal, endOrdinal: planned.endOrdinal, generatedAt: packet.generatedAt, expectedCount: 45, presentCount: packet.rows.length, uniqueCandidateCount: candidateIds.size, uniqueTextHashCount: textHashes.size, missingCount: 0, duplicateCount: 0, unknownCount: 0, positionMismatchCount: 0, textSha256MismatchCount: 0, privacyClearedCount, membershipDigest: packet.membershipDigest, packetPayloadDigest: packet.packetPayloadDigest, allHumanInputFieldsBlank: true, protections: packet.protections, intersectionCounts, combinedPriorBatchIntersectionCount: packet.rows.filter((row) => priorIds.has(row.candidateId)).length, upstreamHashesBefore: beforeHashes, upstreamHashesAfter: afterHashes, nextAction: "HUMAN_REVIEWER_A_COMPLETES_BATCH_9_45_CANDIDATES_USING_CONSOLIDATED_HUMAN_INPUT_CONTRACT" }, null, 2));
