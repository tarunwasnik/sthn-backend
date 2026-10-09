import fs from "node:fs";
import path from "node:path";
import { assertHumanPiiAuthorityHashes, createBlankHumanPiiDecisionTemplate, createMhsV2HumanPiiReviewPacket, publishHumanPiiReviewMaterials } from "../research/textModerationDataset/mhsV2ExpansionHumanPiiDisposition";
import { MhsV2ExpansionCandidateArtifact } from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import { MhsV2PiiDispositionArtifact, MhsV2PiiScreeningArtifact } from "../research/textModerationDataset/mhsV2ExpansionPiiScreening";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), pii = path.join(mhs, "expansion/pii");
const paths = { policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"), candidate: path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), screening: path.join(pii, "mhs-v2-expansion-pii-screening-v1.json"), disposition: path.join(pii, "mhs-v2-expansion-pii-disposition-v1.json"), v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json") };
assertHumanPiiAuthorityHashes(paths);
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact, screening = JSON.parse(fs.readFileSync(paths.screening, "utf8")) as MhsV2PiiScreeningArtifact, disposition = JSON.parse(fs.readFileSync(paths.disposition, "utf8")) as MhsV2PiiDispositionArtifact;
const packet = createMhsV2HumanPiiReviewPacket(candidate, screening, disposition), template = createBlankHumanPiiDecisionTemplate(packet), result = publishHumanPiiReviewMaterials(packet, template, pii);
console.log(JSON.stringify({ ...result, schemaVersion: packet.schemaVersion, packetVersion: packet.packetVersion, rowCount: packet.rows.length, membershipDigest: packet.membershipDigest, allowedDecisions: packet.allowedDecisions, allowedReasonCodes: packet.allowedReasonCodes, nextAction: "COMPLETE_A_COPY_OF_THE_BLANK_DECISION_TEMPLATE_AND_RESUME_T6L_7I2B" }, null, 2));
