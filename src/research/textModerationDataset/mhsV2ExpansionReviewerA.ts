import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CsvRecord, parseCsv } from "./csv";
import { canonicalJson } from "./manifest";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "./mhsCandidateIntegrityAudit";
import { MHS_SPLIT_MANIFEST_SHA256 } from "./mhsInternalTestFreeze";
import { MHS_REVIEWER_A_ID } from "./mhsReviewImport";
import { PILOT_REVIEW_REASON_CODES, REVIEW_CATEGORIES, REVIEW_DECISIONS } from "./mhsReviewPilot";
import { MHS_REVIEW_AUTHORITY_POLICY_VERSION } from "./mhsReviewTranche";
import { MHS_INTERNAL_TEST_FREEZE_SHA256 } from "./mhsTrainingEligibilityReleasePlan";
import { MHS_TRAIN_EXPANSION_DESIGN_SHA256 } from "./mhsTrainExpansionDesign";
import { MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256 } from "./mhsTrainExpansionTrancheProposal";
import { MHS_V2_EXPANSION_ACQUISITION_SHA256, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SHA256, MhsV2ExpansionCandidateArtifact } from "./mhsV2ExpansionCandidateAcquisition";
import { MHS_V2_HUMAN_PII_COMPLETED_INPUT_SHA256, MHS_V2_HUMAN_PII_FINAL_PAYLOAD_DIGEST, MHS_V2_HUMAN_PII_FINAL_SHA256, MhsV2HumanPiiFinalArtifact, validateMhsV2HumanPiiFinalDisposition } from "./mhsV2ExpansionHumanPiiDisposition";
import { MHS_V2_EXPANSION_PII_DISPOSITION_SHA256, MHS_V2_EXPANSION_PII_SCREENING_SHA256 } from "./mhsV2ExpansionPiiScreening";
import { TEXT_MODERATION_PII_POLICY_SHA256 } from "./textModerationPiiPolicy";

export const MHS_V2_REVIEW_UNIVERSE_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_REVIEW_UNIVERSE_V1" as const;
export const MHS_V2_REVIEW_UNIVERSE_VERSION = "MHS_V2_EXPANSION_REVIEW_UNIVERSE_V1" as const;
export const MHS_V2_REVIEW_UNIVERSE_FILENAME = "mhs-v2-expansion-review-universe-v1.json" as const;
export const MHS_V2_REVIEW_BATCH_PACKET_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_REVIEW_BATCH_PACKET_V1" as const;
export const MHS_V2_REVIEW_BATCH_PACKET_VERSION = "MHS_V2_EXPANSION_REVIEW_BATCH_PACKET_V1" as const;
export const MHS_V2_REVIEW_DECISION_TEMPLATE_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_REVIEW_DECISIONS_V1" as const;
export const MHS_V2_REVIEW_DECISION_TEMPLATE_VERSION = "MHS_V2_EXPANSION_REVIEW_DECISIONS_V1" as const;
export const MHS_V2_REVIEW_BATCH_IMPORT_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_REVIEW_BATCH_IMPORT_V1" as const;
export const MHS_V2_REVIEW_BATCH_IMPORT_VERSION = "MHS_V2_EXPANSION_REVIEW_BATCH_IMPORT_V1" as const;
export const MHS_V2_REVIEW_BATCH_PLAN_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_EXPANSION_REVIEW_BATCH_PLAN_V1" as const;
export const MHS_V2_REVIEW_BATCH_PLAN_VERSION = "MHS_V2_EXPANSION_REVIEW_BATCH_PLAN_V1" as const;
export const MHS_V2_REVIEW_BATCH_PLAN_FILENAME = "mhs-v2-expansion-review-batch-plan-v1.json" as const;
export const MHS_V2_REVIEW_UNIVERSE_GENERATED_AT = "2026-09-15T04:00:00.000Z" as const;
// These constants describe the byte-frozen legacy universe artifact and must not be changed.
export const MHS_V2_REVIEW_BATCH_SIZE = 20 as const;
export const MHS_V2_REVIEW_BATCH_COUNT = 20 as const;
export const MHS_V2_REVIEW_ORDERING_RULE = "CANDIDATE_ID_ASCENDING_UTF16_CODE_UNIT_THEN_SEQUENTIAL_FIXED_GROUPS_OF_20" as const;
export const MHS_V2_REVIEW_OPERATIONAL_BATCH_COUNT = 10 as const;
export const MHS_V2_REVIEW_OPERATIONAL_PARTITION_RULE = "FROZEN_UNIVERSE_POSITIONAL_CONTIGUOUS_NO_REORDER_NO_CONTENT_SELECTION" as const;
export const MHS_V2_REVIEW_OPERATIONAL_BATCH_RANGES = [
  { batchNumber: 1, startOrdinal: 1, endOrdinal: 20, memberCount: 20 },
  { batchNumber: 2, startOrdinal: 21, endOrdinal: 40, memberCount: 20 },
  { batchNumber: 3, startOrdinal: 41, endOrdinal: 85, memberCount: 45 },
  { batchNumber: 4, startOrdinal: 86, endOrdinal: 130, memberCount: 45 },
  { batchNumber: 5, startOrdinal: 131, endOrdinal: 175, memberCount: 45 },
  { batchNumber: 6, startOrdinal: 176, endOrdinal: 220, memberCount: 45 },
  { batchNumber: 7, startOrdinal: 221, endOrdinal: 265, memberCount: 45 },
  { batchNumber: 8, startOrdinal: 266, endOrdinal: 310, memberCount: 45 },
  { batchNumber: 9, startOrdinal: 311, endOrdinal: 355, memberCount: 45 },
  { batchNumber: 10, startOrdinal: 356, endOrdinal: 400, memberCount: 45 },
] as const;
export const MHS_V2_REVIEW_UNIVERSE_SHA256 = "ca7e922cac23416e9da64c9a0ceefa52d40df7246f286f940bd1c13fd135095a" as const;
export const MHS_V2_REVIEW_UNIVERSE_PAYLOAD_DIGEST = "c33fad78823c66f4b10d80534ee3a2433447dcd829efc76b4affa7e379350638" as const;
export const MHS_V2_REVIEW_UNIVERSE_MEMBERSHIP_DIGEST = "d7e9b98aa9ebc971b0e3c036f0da1608e1f352a798335e550be1aaf7079c724e" as const;
export const MHS_V2_REVIEW_BATCH_01_MEMBERSHIP_DIGEST = "b56f745367c6de09819e347b889a3513e7994159c93d0cbb697e0f3bc126cfc7" as const;
export const MHS_V2_REVIEW_BATCH_01_PACKET_SHA256 = "82756d950480602a28105e45c4376964f516788752c7cab6ebc974b420abe676" as const;
export const MHS_V2_REVIEW_BATCH_01_PACKET_PAYLOAD_DIGEST = "d59e8d7bc93d0190eeb11ef810f953f906dc3cd13ec3a97685da28876041c93d" as const;
export const MHS_V2_REVIEW_BATCH_01_TEMPLATE_SHA256 = "1c74cec21842725e7f7d1c2451cc9a5665c10e07ccd812e1520f96804365c42d" as const;
export const MHS_V2_REVIEW_BATCH_01_COMPLETED_INPUT_SHA256 = "a8fb8e543dfb3f63f0503b9866c879be407db641f102cea3dbb0e12b762ca435" as const;
export const MHS_V2_REVIEW_BATCH_01_IMPORTED_AT = "2026-09-15T06:00:00.000Z" as const;
export const MHS_V2_REVIEW_BATCH_01_IMPORT_SHA256 = "464aeda113045ef724c2ac3e0b8d7843512f18a0b290637699785ca1de40eb19" as const;
export const MHS_V2_REVIEW_BATCH_01_IMPORT_PAYLOAD_DIGEST = "36f80fda7e84bbc294e0e0504902c4cccbb8ed4a20593b6e445df437f91f6cd2" as const;
export const MHS_V2_REVIEW_BATCH_02_MEMBERSHIP_DIGEST = "75e77ed71fcc7531c3f644e486ee22261f726f19fde8bd27de29863e042eb236" as const;
export const MHS_V2_REVIEW_BATCH_02_PACKET_SHA256 = "812299066d5b3e6ea1faafc654146242a8ed59957cf56cd4a3043fccf68a05d7" as const;
export const MHS_V2_REVIEW_BATCH_02_PACKET_PAYLOAD_DIGEST = "18ecbeddd4e17c1fa166ce3644156fb73acd131e9b7f5ca335636790c1f69921" as const;
export const MHS_V2_REVIEW_BATCH_02_TEMPLATE_SHA256 = "56589008767bf1927391f8439de05d27af5257dfb5af8ae75cc0d6c110bac486" as const;
export const MHS_V2_REVIEW_BATCH_02_COMPLETED_INPUT_SHA256 = "3acc6e154086842eda74935a1a5aab9165d99ffc2e689e951fba2b3225fc1ba6" as const;
export const MHS_V2_REVIEW_BATCH_02_IMPORTED_AT = "2026-09-16T04:00:00.000Z" as const;
export const MHS_V2_REVIEW_BATCH_02_IMPORT_SHA256 = "382e130c91f20cb10f809a011bb28f3474622dbba23726946803f5c5b4280b91" as const;
export const MHS_V2_REVIEW_BATCH_02_IMPORT_PAYLOAD_DIGEST = "96e4cc67cb345ad514dc20f4dd6bd0c20a44cff12d11c4a0c70ed19a3eca3f24" as const;
export const MHS_V2_REVIEW_BATCH_PLAN_SHA256 = "ab253d666cd88456fcd7c06f541cf8d8959ccbe056ddb342ec34f83480866e63" as const;
export const MHS_V2_REVIEW_BATCH_PLAN_PAYLOAD_DIGEST = "361f0d5a874a831fa79f29f6bc639fb7cfe2f1ecca29b541f1f320db8c46d7f9" as const;
export const MHS_V2_REVIEW_BATCH_03_MEMBERSHIP_DIGEST = "a7f8bd934a3b80af3deda2aeb074d62d987e4f0641faa368363b5473b82529de" as const;
export const MHS_V2_REVIEW_BATCH_03_PACKET_SHA256 = "006c4699a5fbe7353a2fd911c5544579590ae89b6166f8985330a54b5ba91639" as const;
export const MHS_V2_REVIEW_BATCH_03_PACKET_PAYLOAD_DIGEST = "820d565002d39c604bfc122120ceb531d9d3d3a173102522f230985222513969" as const;
export const MHS_V2_REVIEW_BATCH_03_TEMPLATE_SHA256 = "5ec98306ad920fd59fcb11cfdd7752017e871fae46b53da1b7202bcc37ab3de0" as const;
export const MHS_V2_REVIEW_BATCH_03_RECOVERY_RECONFIRMED_AT = "2026-09-16T09:03:33.991Z" as const;
export const MHS_V2_REVIEW_BATCH_03_IMPORTED_AT = "2026-09-16T09:03:33.991Z" as const;
export const MHS_V2_REVIEW_BATCH_03_COMPLETED_INPUT_SHA256 = "2556de086b267ca68c6803424d428ccf3f5610893fe6ac7cd94aed8d1eb8eca3" as const;
export const MHS_V2_REVIEW_BATCH_03_IMPORT_SHA256 = "16e36e3a1d93adeed4ada7851631a90f348a38e3f92f048d40eefe01c3492728" as const;
export const MHS_V2_REVIEW_BATCH_03_IMPORT_PAYLOAD_DIGEST = "c9e2af823f44e32062a70df7ba892bfb8acbbaf530b0618e4174a4b7c25afb27" as const;
export const MHS_V2_REVIEW_BATCH_04_MEMBERSHIP_DIGEST = "3abec08c0d9b6461c38fdd11849b631ca6c8a21312ace56658fa3fc7fda6c646" as const;
export const MHS_V2_REVIEW_BATCH_04_PACKET_SHA256 = "7d9674492920def6992859e3770bb77e7362e16ff323fa4a9b4f0aac41670448" as const;
export const MHS_V2_REVIEW_BATCH_04_PACKET_PAYLOAD_DIGEST = "e53017b3869c462e6d34baf959c457bf49df9f2dfe8af934c8d8468828970151" as const;
export const MHS_V2_REVIEW_BATCH_04_TEMPLATE_SHA256 = "1f8ee113375d2dbb21b8fd90e1f0525f0cec04753b1903e742570f7fef3da074" as const;
export const MHS_V2_REVIEW_BATCH_04_RECOVERY_RECONCILED_AT = "2026-09-16T12:47:21.000Z" as const;
export const MHS_V2_REVIEW_BATCH_04_IMPORTED_AT = "2026-09-16T12:47:21.000Z" as const;
export const MHS_V2_REVIEW_BATCH_04_COMPLETED_INPUT_SHA256 = "5b61135da2da37c26c73bf3693cd13821a952abf64265fdf237901200ab0e682" as const;
export const MHS_V2_REVIEW_BATCH_04_IMPORT_SHA256 = "e5b677e860a6d69239546d72af708cc214ea77e8cca21ec8d07938512e23cb5e" as const;
export const MHS_V2_REVIEW_BATCH_04_IMPORT_PAYLOAD_DIGEST = "e55e70d5be659a5b4e82188aaa3ddbee23a61aaab312065343c8231a7efadc38" as const;
export const MHS_V2_REVIEW_BATCH_05_MEMBERSHIP_DIGEST = "260511987490a57b903c87a8ae51dfb87d0d03123ebb62c840a2dfb656378ce7" as const;
export const MHS_V2_REVIEW_BATCH_05_PACKET_SHA256 = "ce53c986eccb7742cbfe8b970da6d149a6e6dc47be0de8365a414d82b897c37d" as const;
export const MHS_V2_REVIEW_BATCH_05_PACKET_PAYLOAD_DIGEST = "5fa2ca4835f56333be302b380d1c62c55f61009b2c6933277c0732c909972e25" as const;
export const MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256 = "69e3195062560d67e1d7edf29a84dc941a7a1b55fd9a52c5da6195acabb5254e" as const;
export const MHS_V2_REVIEW_BATCH_05_RECOVERY_RECONCILED_AT = "2026-09-16T20:11:10.000Z" as const;
export const MHS_V2_REVIEW_BATCH_05_IMPORTED_AT = "2026-09-16T20:11:10.000Z" as const;
export const MHS_V2_REVIEW_BATCH_05_COMPLETED_INPUT_SHA256 = "45a429bf1c38685cbe8c8d3b4d31e89ad6addceffef3f1ce1f06081b26b64d3f" as const;
export const MHS_V2_REVIEW_BATCH_05_IMPORT_SHA256 = "b9024c6471d81d1413b88e6d72262a22f9b68735a1541e225482ff676640da46" as const;
export const MHS_V2_REVIEW_BATCH_05_IMPORT_PAYLOAD_DIGEST = "1a8337dd5f0679e981bc0510820b981f0941cdd3f5c9fe9734a13d8dd73bb1e3" as const;
export const MHS_V2_REVIEW_BATCH_06_MEMBERSHIP_DIGEST = "775cd382631f8f16363ff2f68c4d2a601e003fed17488653fc379a24c6d93118" as const;
export const MHS_V2_REVIEW_BATCH_06_PACKET_SHA256 = "5d9e41be56a604269543f1df0da43939233ed2819dd19d25fef4b69bff64e60e" as const;
export const MHS_V2_REVIEW_BATCH_06_PACKET_PAYLOAD_DIGEST = "9e319ec0388b10edf8e6282f78d5ada4aa3af1a0eb4ebe6ea382afa34e8c63d8" as const;
export const MHS_V2_REVIEW_BATCH_06_TEMPLATE_SHA256 = "619d60e54bf94505bcdc7bd606b378a0f486fbf7b530986b4de841bf6eb985d6" as const;
export const MHS_V2_REVIEW_BATCH_06_CORRECTION_RECONCILED_AT = "2026-09-17T09:32:03.000Z" as const;
export const MHS_V2_REVIEW_BATCH_06_IMPORTED_AT = "2026-09-17T09:32:03.000Z" as const;
export const MHS_V2_REVIEW_BATCH_06_COMPLETED_INPUT_SHA256 = "631ac2b5936eac0001ddbf8f9217783edcfc57abf52b1b0231ae3e9d6dc17fab" as const;
export const MHS_V2_REVIEW_BATCH_06_IMPORT_SHA256 = "01b4ad14553389bb3ca49df26290bc674bab134eef8757a4cecf8ba815c21984" as const;
export const MHS_V2_REVIEW_BATCH_06_IMPORT_PAYLOAD_DIGEST = "819c96e62ce9fc7bf9e673f6c4bf37e725245f151999d67ddfb1636eee5b76b3" as const;
export const MHS_V2_REVIEW_BATCH_07_MEMBERSHIP_DIGEST = "2084d82d93fd0ad55008690f53d90601738d222c265a86b01b32514c1f1ab5d7" as const;
export const MHS_V2_REVIEW_BATCH_07_PACKET_SHA256 = "310ef9577b4399a43ecb81b5b653633b188725bd1bc548244fbe226451552536" as const;
export const MHS_V2_REVIEW_BATCH_07_PACKET_PAYLOAD_DIGEST = "a27037ece9c4b2690c2edc57af6b9bf098bfece73867083f0668b03ff0a90a93" as const;
export const MHS_V2_REVIEW_BATCH_07_TEMPLATE_SHA256 = "01e03c3ab8b769bb9f4da09661c51eb329f3de80df3faeeb787f9ba1f4318efe" as const;
export const MHS_V2_REVIEW_BATCH_07_AUTHORIZATION_RECONCILED_AT = "2026-09-17T12:32:53.000Z" as const;
export const MHS_V2_REVIEW_BATCH_07_IMPORTED_AT = "2026-09-17T12:32:53.000Z" as const;
export const MHS_V2_REVIEW_BATCH_07_COMPLETED_INPUT_SHA256 = "504c110910d98c4a86df9441cd7715cf3de7c5ff31727c537298159393cef803" as const;
export const MHS_V2_REVIEW_BATCH_07_IMPORT_SHA256 = "264142f4f0ade6ae6ab945efdaf75d8a56ecf6ca6678ad66a2eee3d80e6ab438" as const;
export const MHS_V2_REVIEW_BATCH_07_IMPORT_PAYLOAD_DIGEST = "b81a06598a889b6cba927600c91d92a4b61cbefe3131b0f6a052fe0c1e05de40" as const;
export const MHS_V2_REVIEW_BATCH_08_MEMBERSHIP_DIGEST = "db9a8aec7537a976ef9fed6d583cfe52ef62590497e8fe968ac25641eb9d2e57" as const;
export const MHS_V2_REVIEW_BATCH_08_PACKET_SHA256 = "ca432d2d00aa06e27d2d1b60705424189ef85e124bb87f99723efe5e8a38fef5" as const;
export const MHS_V2_REVIEW_BATCH_08_PACKET_PAYLOAD_DIGEST = "b2af742711c7b38277062d52a3598372f877d9ec3d218c666937d6ec80e5ce59" as const;
export const MHS_V2_REVIEW_BATCH_08_TEMPLATE_SHA256 = "31b2215e58601b1e0265f5e55008402477396979bb32dc24a5cad6ae18fc15a7" as const;
export const MHS_V2_REVIEW_BATCH_08_AUTHORITY_RECONCILED_AT = "2026-09-17T18:21:36.000Z" as const;
export const MHS_V2_REVIEW_BATCH_08_IMPORTED_AT = "2026-09-17T18:21:36.000Z" as const;
export const MHS_V2_REVIEW_BATCH_08_COMPLETED_INPUT_SHA256 = "d05f2ed9c03d9073e7b06c359fafa916f32399794424c9d6f1db89f69b87ff23" as const;
export const MHS_V2_REVIEW_BATCH_08_IMPORT_SHA256 = "1bf450c9a39e613c9249da465f6f5e5ab10881380588cbe176c9506ef06886e7" as const;
export const MHS_V2_REVIEW_BATCH_08_IMPORT_PAYLOAD_DIGEST = "8701167038fd9c97c988c10db2228831467bf4e4f77f911bd89a548376f63661" as const;
export const MHS_V2_REVIEW_BATCH_09_MEMBERSHIP_DIGEST = "260ab4ff4e4fd5fb1ff1e99cc03787d6af02084e1871ad67dadf08724875d9ec" as const;
export const MHS_V2_REVIEW_BATCH_09_PACKET_SHA256 = "55762e37a47cd1631aae61e705aaec67d7f4ca020887e82b31da99abeeff74b6" as const;
export const MHS_V2_REVIEW_BATCH_09_PACKET_PAYLOAD_DIGEST = "35c8865980e68e5590f0f8fd64bf9a9578a62a83ad860593fe3aa96a0d523bd9" as const;
export const MHS_V2_REVIEW_BATCH_09_TEMPLATE_SHA256 = "cba9ca3f739fa88662ed73b56fbb7ce3dbb9bfc43d213514c202f5d4618b7599" as const;
export const MHS_V2_REVIEW_BATCH_09_AUTHORITY_RECONCILED_AT = "2026-09-18T07:49:42.000Z" as const;
export const MHS_V2_REVIEW_BATCH_09_IMPORTED_AT = "2026-09-18T07:49:42.000Z" as const;
export const MHS_V2_REVIEW_BATCH_09_COMPLETED_INPUT_SHA256 = "29ff4564606eb8c8f6a2105ff4eb69f5e6c056f863fa530b9cc9ade367e46106" as const;
export const MHS_V2_REVIEW_BATCH_09_IMPORT_SHA256 = "d3835a63aaa2223841d9c8cb6e2bb3ad1f8db541b6ab84c322ec8b51a89321b4" as const;
export const MHS_V2_REVIEW_BATCH_09_IMPORT_PAYLOAD_DIGEST = "7dee3479c052c54604efd27cdc64f176f09980308afd38d135869b178493c6d1" as const;
export const MHS_V2_REVIEW_BATCH_10_MEMBERSHIP_DIGEST = "3717e5772e8750b8f00e78ff3552acb483e024f463d432a81d925f4ccd20b609" as const;
export const MHS_V2_REVIEW_BATCH_10_PACKET_SHA256 = "3f1fe27af3bfb3c69251fddebdf5d76b3bfe070b67ee318c572bbe193ff0506f" as const;
export const MHS_V2_REVIEW_BATCH_10_PACKET_PAYLOAD_DIGEST = "f9db0f19ca08fb84c94f8fd4a6ecde9c2b0fa6fd2eaf73ebc8f112c583b47b99" as const;
export const MHS_V2_REVIEW_BATCH_10_TEMPLATE_SHA256 = "3efbe0d371a72c810f155db9d02584eb051b6f4e28d5156218bc0d6b54e93068" as const;
export const MHS_V2_REVIEW_BATCH_10_AUTHORITY_RECONCILED_AT = "2026-09-18T09:57:04.000Z" as const;
export const MHS_V2_REVIEW_BATCH_10_IMPORTED_AT = "2026-09-18T09:57:04.000Z" as const;
export const MHS_V2_REVIEW_BATCH_10_COMPLETED_INPUT_SHA256 = "75c38fc5aaa7ba95cf393a713022696c368a48cde20792eb15f1c04fdb80befd" as const;
export const MHS_V2_REVIEW_BATCH_10_IMPORT_SHA256 = "442f64214f83c601b4184d5940572d611878064c21d967bf87d4483f1e9196a1" as const;
export const MHS_V2_REVIEW_BATCH_10_IMPORT_PAYLOAD_DIGEST = "3abd90e0fcdb85cc5611b6f974a4ea94c37c14ce7490f2c001e51832bbbb5e26" as const;
export const REVIEWER_A_INDEPENDENCE_DECLARATION = "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS" as const;
export const V2_REVIEW_DECISION_COLUMNS = ["batch_id", "batch_number", "candidate_id", "text_sha256", "decision_input", "primary_category_input", "secondary_categories_input", "reason_code_input", "reviewer_note_input", "reviewer_id_input", "independence_declaration_input", "reviewed_at_input"] as const;
export type V2ReviewDecisionColumn = typeof V2_REVIEW_DECISION_COLUMNS[number];

const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha(canonicalJson(value));
const csvCell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
const compareCandidateId = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const batchId = (number: number): string => `MHS_V2_REVIEW_BATCH_${String(number).padStart(2, "0")}_V1`;
export const batchPacketFilename = (number: number): string => `mhs-v2-expansion-review-batch-${String(number).padStart(2, "0")}-v1.json`;
export const batchTemplateFilename = (number: number): string => `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1.csv`;
export const batchImportFilename = (number: number): string => `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-validated-v1.json`;

export interface MhsV2ReviewMember { readonly ordinal: number; readonly candidateId: string; readonly textSha256: string }
export interface MhsV2ReviewBatchAuthority { readonly batchNumber: number; readonly batchId: string; readonly memberCount: number; readonly membershipDigest: string; readonly members: readonly MhsV2ReviewMember[] }
interface MhsV2ReviewUniversePayload {
  readonly schemaVersion: typeof MHS_V2_REVIEW_UNIVERSE_SCHEMA; readonly universeVersion: typeof MHS_V2_REVIEW_UNIVERSE_VERSION; readonly phase: "T6L-7I3"; readonly status: "FROZEN_REVIEW_UNIVERSE";
  readonly authorities: Readonly<Record<string, string>>; readonly reviewerContract: { readonly role: "A"; readonly reviewerId: typeof MHS_REVIEWER_A_ID; readonly policyVersion: typeof MHS_REVIEW_AUTHORITY_POLICY_VERSION; readonly decisions: typeof REVIEW_DECISIONS; readonly categories: typeof REVIEW_CATEGORIES; readonly reasonCodes: typeof PILOT_REVIEW_REASON_CODES };
  readonly candidateCount: 400; readonly membershipDigest: string; readonly orderingRule: typeof MHS_V2_REVIEW_ORDERING_RULE; readonly members: readonly MhsV2ReviewMember[];
  readonly batchPolicy: { readonly batchSize: 20; readonly batchCount: 20; readonly partition: "SEQUENTIAL_NON_OVERLAPPING"; readonly allMembershipsFrozenBeforeReview: true }; readonly batches: readonly MhsV2ReviewBatchAuthority[];
  readonly reviewerSurfaceContract: { readonly exactTextOnlyInMaterializedBatchPacket: true; readonly sourceMeasurementsHidden: true; readonly proposalStrataHidden: true; readonly sourceLabelsHidden: true; readonly modelAndSemanticSignalsHidden: true; readonly targetQuotasHidden: true };
  readonly boundaries: Readonly<Record<string, boolean>>; readonly generatedAt: typeof MHS_V2_REVIEW_UNIVERSE_GENERATED_AT;
}
export type MhsV2ReviewUniverseArtifact = MhsV2ReviewUniversePayload & { readonly universePayloadDigest: string };

interface MhsV2ReviewBatchPacketPayload {
  readonly schemaVersion: typeof MHS_V2_REVIEW_BATCH_PACKET_SCHEMA; readonly packetVersion: typeof MHS_V2_REVIEW_BATCH_PACKET_VERSION; readonly phase: "T6L-7I3"; readonly reviewerRole: "A";
  readonly universeArtifactSha256: string; readonly universePayloadDigest: string; readonly universeMembershipDigest: string; readonly batchNumber: number; readonly batchId: string; readonly memberCount: number; readonly membershipDigest: string;
  readonly rows: readonly { readonly batchId: string; readonly batchNumber: number; readonly candidateId: string; readonly text: string; readonly textSha256: string }[];
  readonly humanInputContract: { readonly templateSchema: typeof MHS_V2_REVIEW_DECISION_TEMPLATE_SCHEMA; readonly templateVersion: typeof MHS_V2_REVIEW_DECISION_TEMPLATE_VERSION; readonly allDecisionFieldsInitiallyBlank: true };
  readonly protections: Readonly<Record<string, boolean>>; readonly generatedAt: typeof MHS_V2_REVIEW_UNIVERSE_GENERATED_AT;
}
export type MhsV2ReviewBatchPacketArtifact = MhsV2ReviewBatchPacketPayload & { readonly packetPayloadDigest: string };

export interface ImportedV2ReviewerADecision { readonly candidateId: string; readonly textSha256: string; readonly decision: typeof REVIEW_DECISIONS[number]; readonly primaryCategory: typeof REVIEW_CATEGORIES[number] | null; readonly secondaryCategories: readonly typeof REVIEW_CATEGORIES[number][]; readonly reasonCode: typeof PILOT_REVIEW_REASON_CODES[number]; readonly reviewerNote: string | null; readonly reviewerId: typeof MHS_REVIEWER_A_ID; readonly independenceDeclaration: typeof REVIEWER_A_INDEPENDENCE_DECLARATION; readonly reviewedAt: string }
export interface MhsV2ReviewerAHumanInput { readonly decision: typeof REVIEW_DECISIONS[number]; readonly primaryCategory: typeof REVIEW_CATEGORIES[number] | null; readonly secondaryCategories: readonly typeof REVIEW_CATEGORIES[number][]; readonly reasonCode: typeof PILOT_REVIEW_REASON_CODES[number]; readonly reviewerNote: string | null; readonly reviewerId: typeof MHS_REVIEWER_A_ID; readonly independenceDeclaration: typeof REVIEWER_A_INDEPENDENCE_DECLARATION; readonly reviewedAt: string }
export interface MhsV2ReviewBatchImportArtifact { readonly schemaVersion: typeof MHS_V2_REVIEW_BATCH_IMPORT_SCHEMA; readonly importVersion: typeof MHS_V2_REVIEW_BATCH_IMPORT_VERSION; readonly phase: "T6L-7I3"; readonly validationStatus: "VALIDATED"; readonly universeArtifactSha256: string; readonly universePayloadDigest: string; readonly packetArtifactSha256: string; readonly packetPayloadDigest: string; readonly blankDecisionTemplateSha256: string; readonly batchNumber: number; readonly batchId: string; readonly membershipDigest: string; readonly completedInputFilename: string; readonly completedInputSha256: string; readonly reviewerRole: "A"; readonly reviewerId: typeof MHS_REVIEWER_A_ID; readonly rowCount: number; readonly decisions: readonly ImportedV2ReviewerADecision[]; readonly importedAt: string; readonly payloadIntegrityDigest: string }

export interface MhsV2ReviewOperationalBatchAuthority { readonly batchNumber: number; readonly batchId: string; readonly startOrdinal: number; readonly endOrdinal: number; readonly memberCount: number; readonly membershipDigest: string }
interface MhsV2ReviewBatchPlanPayload {
  readonly schemaVersion: typeof MHS_V2_REVIEW_BATCH_PLAN_SCHEMA; readonly planVersion: typeof MHS_V2_REVIEW_BATCH_PLAN_VERSION; readonly phase: "T6L-7I3"; readonly status: "FROZEN_OPERATIONAL_REPARTITION";
  readonly universeArtifactSha256: string; readonly universePayloadDigest: string; readonly universeMembershipDigest: string; readonly candidateCount: 400; readonly batchCount: 10; readonly partitionRule: typeof MHS_V2_REVIEW_OPERATIONAL_PARTITION_RULE;
  readonly batches: readonly MhsV2ReviewOperationalBatchAuthority[]; readonly protections: { readonly universeReordered: false; readonly contentBasedSelectionUsed: false; readonly priorReviewDecisionsUsed: false; readonly candidateMembershipChanged: false };
}
export type MhsV2ReviewBatchPlanArtifact = MhsV2ReviewBatchPlanPayload & { readonly planPayloadDigest: string };

export const reviewMembershipDigest = (members: readonly Pick<MhsV2ReviewMember, "candidateId" | "textSha256">[]): string => digest(members.map(({ candidateId, textSha256 }) => ({ candidateId, textSha256 })));

const operationalBatchRange = (number: number): typeof MHS_V2_REVIEW_OPERATIONAL_BATCH_RANGES[number] => {
  const range = MHS_V2_REVIEW_OPERATIONAL_BATCH_RANGES.find((item) => item.batchNumber === number);
  if (!range) throw new Error("Invalid operational review batch number");
  return range;
};

export const getMhsV2OperationalReviewBatch = (universe: MhsV2ReviewUniverseArtifact, number: number): MhsV2ReviewBatchAuthority => {
  validateMhsV2ReviewUniverse(universe);
  const range = operationalBatchRange(number), members = universe.members.slice(range.startOrdinal - 1, range.endOrdinal);
  if (members.length !== range.memberCount || members[0]?.ordinal !== range.startOrdinal || members[members.length - 1]?.ordinal !== range.endOrdinal) throw new Error("Operational review batch positional range mismatch");
  return { batchNumber: number, batchId: batchId(number), memberCount: range.memberCount, membershipDigest: reviewMembershipDigest(members), members };
};

export const createMhsV2ReviewBatchPlan = (universe: MhsV2ReviewUniverseArtifact): MhsV2ReviewBatchPlanArtifact => {
  validateMhsV2ReviewUniverse(universe);
  const batches = MHS_V2_REVIEW_OPERATIONAL_BATCH_RANGES.map((range) => { const authority = getMhsV2OperationalReviewBatch(universe, range.batchNumber); return { batchNumber: range.batchNumber, batchId: authority.batchId, startOrdinal: range.startOrdinal, endOrdinal: range.endOrdinal, memberCount: range.memberCount, membershipDigest: authority.membershipDigest }; });
  const payload: MhsV2ReviewBatchPlanPayload = { schemaVersion: MHS_V2_REVIEW_BATCH_PLAN_SCHEMA, planVersion: MHS_V2_REVIEW_BATCH_PLAN_VERSION, phase: "T6L-7I3", status: "FROZEN_OPERATIONAL_REPARTITION", universeArtifactSha256: sha(canonicalJson(universe)), universePayloadDigest: universe.universePayloadDigest, universeMembershipDigest: universe.membershipDigest, candidateCount: 400, batchCount: MHS_V2_REVIEW_OPERATIONAL_BATCH_COUNT, partitionRule: MHS_V2_REVIEW_OPERATIONAL_PARTITION_RULE, batches, protections: { universeReordered: false, contentBasedSelectionUsed: false, priorReviewDecisionsUsed: false, candidateMembershipChanged: false } };
  const artifact = { ...payload, planPayloadDigest: digest(payload) }; validateMhsV2ReviewBatchPlan(artifact, universe); return artifact;
};

export const validateMhsV2ReviewBatchPlan = (artifact: MhsV2ReviewBatchPlanArtifact, universe: MhsV2ReviewUniverseArtifact): void => {
  validateMhsV2ReviewUniverse(universe); const { planPayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_REVIEW_BATCH_PLAN_SCHEMA || artifact.planVersion !== MHS_V2_REVIEW_BATCH_PLAN_VERSION || artifact.phase !== "T6L-7I3" || artifact.status !== "FROZEN_OPERATIONAL_REPARTITION" || artifact.universeArtifactSha256 !== sha(canonicalJson(universe)) || artifact.universePayloadDigest !== universe.universePayloadDigest || artifact.universeMembershipDigest !== universe.membershipDigest || artifact.candidateCount !== 400 || artifact.batchCount !== 10 || artifact.partitionRule !== MHS_V2_REVIEW_OPERATIONAL_PARTITION_RULE || artifact.batches.length !== 10 || Object.values(artifact.protections).some(Boolean) || planPayloadDigest !== digest(payload)) throw new Error("Invalid V2 Reviewer A operational batch plan");
  const ordinals: number[] = [];
  artifact.batches.forEach((batch, index) => { const range = MHS_V2_REVIEW_OPERATIONAL_BATCH_RANGES[index], authority = getMhsV2OperationalReviewBatch(universe, range.batchNumber); if (batch.batchNumber !== range.batchNumber || batch.batchId !== authority.batchId || batch.startOrdinal !== range.startOrdinal || batch.endOrdinal !== range.endOrdinal || batch.memberCount !== range.memberCount || batch.endOrdinal - batch.startOrdinal + 1 !== batch.memberCount || batch.membershipDigest !== authority.membershipDigest) throw new Error("Invalid operational review batch range"); for (let ordinal = batch.startOrdinal; ordinal <= batch.endOrdinal; ordinal += 1) ordinals.push(ordinal); });
  if (ordinals.length !== 400 || new Set(ordinals).size !== 400 || ordinals.some((ordinal, index) => ordinal !== index + 1)) throw new Error("Operational review batch plan has a gap or overlap");
  if (artifact.batches[0].membershipDigest !== MHS_V2_REVIEW_BATCH_01_MEMBERSHIP_DIGEST || artifact.batches[1].membershipDigest !== MHS_V2_REVIEW_BATCH_02_MEMBERSHIP_DIGEST) throw new Error("Historical review batch membership changed");
};

export const createMhsV2ReviewUniverse = (candidate: MhsV2ExpansionCandidateArtifact, privacy: MhsV2HumanPiiFinalArtifact): MhsV2ReviewUniverseArtifact => {
  validateMhsV2HumanPiiFinalDisposition(privacy);
  if (sha(canonicalJson(candidate)) !== MHS_V2_EXPANSION_CANDIDATE_SHA256 || candidate.membershipDigest !== MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST || sha(canonicalJson(privacy)) !== MHS_V2_HUMAN_PII_FINAL_SHA256 || privacy.dispositionPayloadDigest !== MHS_V2_HUMAN_PII_FINAL_PAYLOAD_DIGEST || privacy.authorizationDecision !== "AUTHORIZE_T6L_7I3_REVIEWER_A_REVIEW" || privacy.reviewDispositionCounts.ELIGIBLE_FOR_REVIEW !== 400 || privacy.reviewDispositionCounts.REQUIRES_PII_REVIEW !== 0 || privacy.reviewDispositionCounts.EXCLUDED !== 0 || privacy.piiStatusCounts.REDACTED !== 0) throw new Error("V2 review universe upstream authority or privacy gate mismatch");
  const privacyById = new Map(privacy.finalRows.map((row) => [row.candidateId, row]));
  const members: MhsV2ReviewMember[] = [...candidate.rows].sort((a, b) => compareCandidateId(a.candidateId, b.candidateId)).map((row, index) => {
    const final = privacyById.get(row.candidateId); if (!final || final.textSha256 !== row.exactTextDigest || final.reviewDisposition !== "ELIGIBLE_FOR_REVIEW" || sha(row.text) !== row.exactTextDigest) throw new Error("Review member is not privacy-cleared or text-bound");
    return { ordinal: index + 1, candidateId: row.candidateId, textSha256: row.exactTextDigest };
  });
  if (members.length !== 400 || new Set(members.map((row) => row.candidateId)).size !== 400) throw new Error("Review universe requires 400 unique candidates");
  const batches: MhsV2ReviewBatchAuthority[] = Array.from({ length: MHS_V2_REVIEW_BATCH_COUNT }, (_, index) => { const batchNumber = index + 1, batchMembers = members.slice(index * MHS_V2_REVIEW_BATCH_SIZE, (index + 1) * MHS_V2_REVIEW_BATCH_SIZE); if (batchMembers.length !== 20) throw new Error("Review batch must contain 20 members"); return { batchNumber, batchId: batchId(batchNumber), memberCount: 20, membershipDigest: reviewMembershipDigest(batchMembers), members: batchMembers }; });
  const payload: MhsV2ReviewUniversePayload = { schemaVersion: MHS_V2_REVIEW_UNIVERSE_SCHEMA, universeVersion: MHS_V2_REVIEW_UNIVERSE_VERSION, phase: "T6L-7I3", status: "FROZEN_REVIEW_UNIVERSE", authorities: { candidateArtifactSha256: MHS_V2_EXPANSION_CANDIDATE_SHA256, candidateMembershipDigest: MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, acquisitionArtifactSha256: MHS_V2_EXPANSION_ACQUISITION_SHA256, privacyDispositionArtifactSha256: MHS_V2_HUMAN_PII_FINAL_SHA256, privacyDispositionPayloadDigest: MHS_V2_HUMAN_PII_FINAL_PAYLOAD_DIGEST, completedPrivacyInputSha256: MHS_V2_HUMAN_PII_COMPLETED_INPUT_SHA256 }, reviewerContract: { role: "A", reviewerId: MHS_REVIEWER_A_ID, policyVersion: MHS_REVIEW_AUTHORITY_POLICY_VERSION, decisions: REVIEW_DECISIONS, categories: REVIEW_CATEGORIES, reasonCodes: PILOT_REVIEW_REASON_CODES }, candidateCount: 400, membershipDigest: reviewMembershipDigest(members), orderingRule: MHS_V2_REVIEW_ORDERING_RULE, members, batchPolicy: { batchSize: 20, batchCount: 20, partition: "SEQUENTIAL_NON_OVERLAPPING", allMembershipsFrozenBeforeReview: true }, batches, reviewerSurfaceContract: { exactTextOnlyInMaterializedBatchPacket: true, sourceMeasurementsHidden: true, proposalStrataHidden: true, sourceLabelsHidden: true, modelAndSemanticSignalsHidden: true, targetQuotasHidden: true }, boundaries: { moderationDecisionsGenerated: false, candidateMutated: false, admissionPerformed: false, splitMembershipMutated: false, internalTestContentAccessed: false, frozen140ContentAccessed: false, semanticProcessingPerformed: false, modelInferencePerformed: false, trainingPerformed: false }, generatedAt: MHS_V2_REVIEW_UNIVERSE_GENERATED_AT };
  const artifact = { ...payload, universePayloadDigest: digest(payload) }; validateMhsV2ReviewUniverse(artifact); return artifact;
};

export const validateMhsV2ReviewUniverse = (artifact: MhsV2ReviewUniverseArtifact): void => {
  const { universePayloadDigest, ...payload } = artifact;
  if (artifact.schemaVersion !== MHS_V2_REVIEW_UNIVERSE_SCHEMA || artifact.universeVersion !== MHS_V2_REVIEW_UNIVERSE_VERSION || artifact.candidateCount !== 400 || artifact.members.length !== 400 || new Set(artifact.members.map((row) => row.candidateId)).size !== 400 || universePayloadDigest !== digest(payload) || artifact.membershipDigest !== reviewMembershipDigest(artifact.members) || artifact.batches.length !== 20 || artifact.members.some((row, index) => row.ordinal !== index + 1 || (index > 0 && compareCandidateId(artifact.members[index - 1].candidateId, row.candidateId) >= 0)) || Object.values(artifact.boundaries).some(Boolean)) throw new Error("Invalid V2 Reviewer A universe");
  const flat = artifact.batches.flatMap((batch) => batch.members); if (flat.length !== 400 || new Set(flat.map((row) => row.candidateId)).size !== 400 || canonicalJson(flat) !== canonicalJson(artifact.members)) throw new Error("Review batch union/intersection mismatch");
  artifact.batches.forEach((batch, index) => { if (batch.batchNumber !== index + 1 || batch.batchId !== batchId(index + 1) || batch.memberCount !== 20 || batch.members.length !== 20 || batch.membershipDigest !== reviewMembershipDigest(batch.members)) throw new Error("Invalid frozen review batch"); });
};

export const createMhsV2ReviewBatchPacket = (universe: MhsV2ReviewUniverseArtifact, candidate: MhsV2ExpansionCandidateArtifact, batchNumber: number): MhsV2ReviewBatchPacketArtifact => {
  validateMhsV2ReviewUniverse(universe); if (!Number.isInteger(batchNumber) || batchNumber < 1 || batchNumber > MHS_V2_REVIEW_OPERATIONAL_BATCH_COUNT) throw new Error("Invalid review batch number");
  const batch = getMhsV2OperationalReviewBatch(universe, batchNumber), candidates = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  const rows = batch.members.map((member) => { const row = candidates.get(member.candidateId); if (!row || row.exactTextDigest !== member.textSha256 || sha(row.text) !== member.textSha256) throw new Error("Batch packet candidate text binding mismatch"); return { batchId: batch.batchId, batchNumber, candidateId: member.candidateId, text: row.text, textSha256: member.textSha256 }; });
  const payload: MhsV2ReviewBatchPacketPayload = { schemaVersion: MHS_V2_REVIEW_BATCH_PACKET_SCHEMA, packetVersion: MHS_V2_REVIEW_BATCH_PACKET_VERSION, phase: "T6L-7I3", reviewerRole: "A", universeArtifactSha256: sha(canonicalJson(universe)), universePayloadDigest: universe.universePayloadDigest, universeMembershipDigest: universe.membershipDigest, batchNumber, batchId: batch.batchId, memberCount: batch.memberCount, membershipDigest: batch.membershipDigest, rows, humanInputContract: { templateSchema: MHS_V2_REVIEW_DECISION_TEMPLATE_SCHEMA, templateVersion: MHS_V2_REVIEW_DECISION_TEMPLATE_VERSION, allDecisionFieldsInitiallyBlank: true }, protections: { sourceMeasurementsExposed: false, proposalStrataExposed: false, sourceLabelsExposed: false, expectedLabelsExposed: false, modelSignalsExposed: false, semanticSignalsExposed: false, moderationDecisionsGenerated: false, internalTestContentAccessed: false, frozen140ContentAccessed: false }, generatedAt: MHS_V2_REVIEW_UNIVERSE_GENERATED_AT };
  const artifact = { ...payload, packetPayloadDigest: digest(payload) }; validateMhsV2ReviewBatchPacket(artifact, universe, candidate); return artifact;
};

export const validateMhsV2ReviewBatchPacket = (packet: MhsV2ReviewBatchPacketArtifact, universe: MhsV2ReviewUniverseArtifact, candidate: MhsV2ExpansionCandidateArtifact): void => {
  const { packetPayloadDigest, ...payload } = packet, batch = getMhsV2OperationalReviewBatch(universe, packet.batchNumber), candidateById = new Map(candidate.rows.map((row) => [row.candidateId, row]));
  if (packet.schemaVersion !== MHS_V2_REVIEW_BATCH_PACKET_SCHEMA || packet.packetVersion !== MHS_V2_REVIEW_BATCH_PACKET_VERSION || packet.batchId !== batch.batchId || packet.memberCount !== batch.memberCount || packet.rows.length !== batch.memberCount || new Set(packet.rows.map((row) => row.candidateId)).size !== batch.memberCount || packet.membershipDigest !== batch.membershipDigest || packet.universeArtifactSha256 !== sha(canonicalJson(universe)) || packetPayloadDigest !== digest(payload) || Object.values(packet.protections).some(Boolean)) throw new Error("Invalid V2 Reviewer A batch packet");
  packet.rows.forEach((row, index) => { const member = batch.members[index], source = candidateById.get(row.candidateId); if (row.candidateId !== member.candidateId || row.textSha256 !== member.textSha256 || row.batchId !== batch.batchId || row.batchNumber !== batch.batchNumber || !source || row.text !== source.text || sha(row.text) !== row.textSha256) throw new Error("Batch packet membership or text mismatch"); });
  const forbidden = ["sourceMeasurements", "selectionStratum", "proposalIndex", "hate_speech_score", "hatespeech", "dehumanize", "insult", "humiliate", "violence", "genocide", "attack_defend", "finalSthnDecision", "modelPrediction", "logits", "probabilities", "similarity"];
  if (forbidden.some((key) => JSON.stringify(packet).includes(`\"${key}\"`))) throw new Error("Reviewer packet leaks prohibited judgment signals");
};

const serializeDecisionCsv = (rows: readonly Record<V2ReviewDecisionColumn, string>[]): string => `${V2_REVIEW_DECISION_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => V2_REVIEW_DECISION_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
export const createBlankMhsV2ReviewDecisionTemplate = (packet: MhsV2ReviewBatchPacketArtifact): string => serializeDecisionCsv(packet.rows.map((row) => ({ batch_id: row.batchId, batch_number: String(row.batchNumber), candidate_id: row.candidateId, text_sha256: row.textSha256, decision_input: "", primary_category_input: "", secondary_categories_input: "", reason_code_input: "", reviewer_note_input: "", reviewer_id_input: "", independence_declaration_input: "", reviewed_at_input: "" })));
export const createCompletedMhsV2ReviewDecisionCsv = (packet: MhsV2ReviewBatchPacketArtifact, inputs: readonly MhsV2ReviewerAHumanInput[]): string => {
  if (inputs.length !== packet.memberCount) throw new Error(`Completed Reviewer A input requires exactly ${packet.memberCount} human judgments`);
  const csv = serializeDecisionCsv(packet.rows.map((row, index) => { const input = inputs[index]; return { batch_id: row.batchId, batch_number: String(row.batchNumber), candidate_id: row.candidateId, text_sha256: row.textSha256, decision_input: input.decision, primary_category_input: input.primaryCategory ?? "", secondary_categories_input: input.secondaryCategories.join(";"), reason_code_input: input.reasonCode, reviewer_note_input: input.reviewerNote ?? "", reviewer_id_input: input.reviewerId, independence_declaration_input: input.independenceDeclaration, reviewed_at_input: input.reviewedAt }; }));
  parseCompletedMhsV2ReviewBatch(csv, packet); return csv;
};
const assertDecisionColumns = (row: CsvRecord): void => { const keys = Object.keys(row); if (keys.length !== V2_REVIEW_DECISION_COLUMNS.length || V2_REVIEW_DECISION_COLUMNS.some((column, index) => keys[index] !== column)) throw new Error("V2 Reviewer A decision columns do not match the frozen contract"); };
const validateDecisionIdentity = (records: readonly CsvRecord[], packet: MhsV2ReviewBatchPacketArtifact): void => {
  if (records.length !== packet.memberCount || new Set(records.map((row) => row.candidate_id)).size !== packet.memberCount) throw new Error(`Reviewer A batch submission requires exactly ${packet.memberCount} unique members`); const expected = new Map(packet.rows.map((row) => [row.candidateId, row]));
  records.forEach((record) => { assertDecisionColumns(record); const row = expected.get(record.candidate_id); if (!row) throw new Error("Unknown or extra Reviewer A batch candidate"); if (record.batch_id !== packet.batchId || record.batch_number !== String(packet.batchNumber) || record.text_sha256 !== row.textSha256) throw new Error("Reviewer A batch identity or text SHA mismatch"); });
};
const decisionInputs = ["decision_input", "primary_category_input", "secondary_categories_input", "reason_code_input", "reviewer_note_input", "reviewer_id_input", "independence_declaration_input", "reviewed_at_input"] as const;
export const validateBlankMhsV2ReviewDecisionTemplate = (csv: string, packet: MhsV2ReviewBatchPacketArtifact): void => { const records = parseCsv(csv); validateDecisionIdentity(records, packet); records.forEach((row) => decisionInputs.forEach((column) => { if (row[column] !== "") throw new Error(`Prepared Reviewer A field ${column} must be blank`); })); };
const bounded = <T extends string>(value: string, allowed: readonly T[], field: string): T => { if (!allowed.includes(value as T)) throw new Error(`Invalid ${field}: ${value}`); return value as T; };
export const parseCompletedMhsV2ReviewBatch = (csv: string, packet: MhsV2ReviewBatchPacketArtifact): readonly ImportedV2ReviewerADecision[] => {
  const records = parseCsv(csv); validateDecisionIdentity(records, packet); return records.map((record) => { if (record.reviewer_id_input !== MHS_REVIEWER_A_ID || record.independence_declaration_input !== REVIEWER_A_INDEPENDENCE_DECLARATION) throw new Error("Reviewer A identity or independence declaration mismatch"); const decision = bounded(record.decision_input, REVIEW_DECISIONS, "decision"), primaryCategory = record.primary_category_input ? bounded(record.primary_category_input, REVIEW_CATEGORIES, "primary category") : null, secondaryCategories = record.secondary_categories_input ? record.secondary_categories_input.split(";").map((value) => bounded(value.trim(), REVIEW_CATEGORIES, "secondary category")) : []; if (new Set(secondaryCategories).size !== secondaryCategories.length || (primaryCategory && secondaryCategories.includes(primaryCategory))) throw new Error("Reviewer categories must be unique"); if (decision === "BLOCK" && !primaryCategory) throw new Error("BLOCK review requires a primary category"); if (decision !== "BLOCK" && (primaryCategory || secondaryCategories.length)) throw new Error("Non-BLOCK review cannot carry categories"); const reasonCode = bounded(record.reason_code_input, PILOT_REVIEW_REASON_CODES, "reason code"); if ((record.reviewer_note_input?.length ?? 0) > 500 || !Number.isFinite(Date.parse(record.reviewed_at_input))) throw new Error("Reviewer note or timestamp is invalid"); return { candidateId: record.candidate_id, textSha256: record.text_sha256, decision, primaryCategory, secondaryCategories, reasonCode, reviewerNote: record.reviewer_note_input || null, reviewerId: MHS_REVIEWER_A_ID, independenceDeclaration: REVIEWER_A_INDEPENDENCE_DECLARATION, reviewedAt: record.reviewed_at_input }; });
};

export const validateMhsV2ReviewBatchImport = (artifact: MhsV2ReviewBatchImportArtifact): void => {
  const { payloadIntegrityDigest, ...payload } = artifact, expectedCount = operationalBatchRange(artifact.batchNumber).memberCount, hashFields = [artifact.universeArtifactSha256, artifact.universePayloadDigest, artifact.packetArtifactSha256, artifact.packetPayloadDigest, artifact.blankDecisionTemplateSha256, artifact.membershipDigest, artifact.completedInputSha256, artifact.payloadIntegrityDigest];
  if (artifact.schemaVersion !== MHS_V2_REVIEW_BATCH_IMPORT_SCHEMA || artifact.importVersion !== MHS_V2_REVIEW_BATCH_IMPORT_VERSION || artifact.phase !== "T6L-7I3" || artifact.validationStatus !== "VALIDATED" || artifact.reviewerRole !== "A" || artifact.reviewerId !== MHS_REVIEWER_A_ID || artifact.rowCount !== expectedCount || artifact.decisions.length !== expectedCount || new Set(artifact.decisions.map((row) => row.candidateId)).size !== expectedCount || hashFields.some((value) => !/^[a-f0-9]{64}$/u.test(value)) || reviewMembershipDigest(artifact.decisions) !== artifact.membershipDigest || !Number.isFinite(Date.parse(artifact.importedAt)) || payloadIntegrityDigest !== digest(payload)) throw new Error("Invalid V2 Reviewer A batch import artifact");
  artifact.decisions.forEach((row) => { const primaryValid = row.primaryCategory === null || (REVIEW_CATEGORIES as readonly string[]).includes(row.primaryCategory), secondaryValid = row.secondaryCategories.every((category) => (REVIEW_CATEGORIES as readonly string[]).includes(category)); if (!(REVIEW_DECISIONS as readonly string[]).includes(row.decision) || !primaryValid || !secondaryValid || new Set(row.secondaryCategories).size !== row.secondaryCategories.length || (row.primaryCategory !== null && row.secondaryCategories.includes(row.primaryCategory)) || !(PILOT_REVIEW_REASON_CODES as readonly string[]).includes(row.reasonCode) || row.reviewerId !== MHS_REVIEWER_A_ID || row.independenceDeclaration !== REVIEWER_A_INDEPENDENCE_DECLARATION || (row.decision === "BLOCK") !== (row.primaryCategory !== null) || (row.decision !== "BLOCK" && row.secondaryCategories.length > 0) || (row.reviewerNote?.length ?? 0) > 500 || !Number.isFinite(Date.parse(row.reviewedAt))) throw new Error("Invalid persisted Reviewer A decision"); });
};
export const createMhsV2ReviewBatchImport = (universe: MhsV2ReviewUniverseArtifact, packet: MhsV2ReviewBatchPacketArtifact, completedCsv: string, completedFilename: string, blankDecisionTemplateSha256: string, importedAt: string): MhsV2ReviewBatchImportArtifact => { const decisions = parseCompletedMhsV2ReviewBatch(completedCsv, packet); const payload = { schemaVersion: MHS_V2_REVIEW_BATCH_IMPORT_SCHEMA, importVersion: MHS_V2_REVIEW_BATCH_IMPORT_VERSION, phase: "T6L-7I3" as const, validationStatus: "VALIDATED" as const, universeArtifactSha256: sha(canonicalJson(universe)), universePayloadDigest: universe.universePayloadDigest, packetArtifactSha256: sha(canonicalJson(packet)), packetPayloadDigest: packet.packetPayloadDigest, blankDecisionTemplateSha256, batchNumber: packet.batchNumber, batchId: packet.batchId, membershipDigest: packet.membershipDigest, completedInputFilename: path.basename(completedFilename), completedInputSha256: sha(completedCsv), reviewerRole: "A" as const, reviewerId: MHS_REVIEWER_A_ID, rowCount: packet.memberCount, decisions, importedAt }; if (!/^[a-f0-9]{64}$/u.test(blankDecisionTemplateSha256) || !Number.isFinite(Date.parse(importedAt))) throw new Error("Batch import authority or timestamp is invalid"); const artifact = { ...payload, payloadIntegrityDigest: digest(payload) }; validateMhsV2ReviewBatchImport(artifact); return artifact; };

type TriplePublisher = (universeTemporary: string, universeTarget: string, packetTemporary: string, packetTarget: string, templateTemporary: string, templateTarget: string) => void;
const defaultTriplePublisher: TriplePublisher = (u, ut, p, pt, t, tt) => { fs.renameSync(u, ut); fs.renameSync(p, pt); fs.renameSync(t, tt); };
export const publishMhsV2ReviewBatch1Materials = (universe: MhsV2ReviewUniverseArtifact, packet: MhsV2ReviewBatchPacketArtifact, template: string, outputDirectory: string, publish: TriplePublisher = defaultTriplePublisher): { universePath: string; packetPath: string; templatePath: string; universeSha256: string; packetSha256: string; templateSha256: string } => {
  validateMhsV2ReviewUniverse(universe); if (packet.batchNumber !== 1) throw new Error("T6L-7I3 may publish Batch 1 only"); validateBlankMhsV2ReviewDecisionTemplate(template, packet);
  const batchDirectory = path.join(outputDirectory, "batch-01"), universePath = path.join(outputDirectory, MHS_V2_REVIEW_UNIVERSE_FILENAME), packetPath = path.join(batchDirectory, batchPacketFilename(1)), templatePath = path.join(batchDirectory, batchTemplateFilename(1)); if ([universePath, packetPath, templatePath].some(fs.existsSync)) throw new Error("V2 review material exists; overwrite refused"); fs.mkdirSync(batchDirectory, { recursive: true });
  const contents = [canonicalJson(universe), canonicalJson(packet), template] as const, targets = [universePath, packetPath, templatePath] as const, token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, temporaries = targets.map((target) => `${target}.${token}.partial`) as [string, string, string];
  try { temporaries.forEach((temporary, index) => fs.writeFileSync(temporary, contents[index], { flag: "wx" })); publish(temporaries[0], targets[0], temporaries[1], targets[1], temporaries[2], targets[2]); targets.forEach((target, index) => { if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== contents[index]) throw new Error("Incomplete V2 review material publication"); }); return { universePath, packetPath, templatePath, universeSha256: sha(contents[0]), packetSha256: sha(contents[1]), templateSha256: sha(contents[2]) }; }
  catch (error) { targets.forEach((target, index) => { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === contents[index]) fs.rmSync(target, { force: true }); }); throw error; } finally { temporaries.forEach((temporary) => fs.rmSync(temporary, { force: true })); }
};

export const publishMhsV2ReviewBatchPlanAndMaterials = (plan: MhsV2ReviewBatchPlanArtifact, universe: MhsV2ReviewUniverseArtifact, candidate: MhsV2ExpansionCandidateArtifact, packet: MhsV2ReviewBatchPacketArtifact, template: string, reviewDirectory: string, publish: TriplePublisher = defaultTriplePublisher): { planPath: string; packetPath: string; templatePath: string; planSha256: string; packetSha256: string; templateSha256: string } => {
  validateMhsV2ReviewBatchPlan(plan, universe); validateMhsV2ReviewBatchPacket(packet, universe, candidate); validateBlankMhsV2ReviewDecisionTemplate(template, packet);
  if (packet.batchNumber !== 3) throw new Error("Operational repartition publication may prepare Batch 3 only");
  const batchDirectory = path.join(reviewDirectory, "batch-03"), planPath = path.join(reviewDirectory, MHS_V2_REVIEW_BATCH_PLAN_FILENAME), packetPath = path.join(batchDirectory, batchPacketFilename(3)), templatePath = path.join(batchDirectory, batchTemplateFilename(3));
  if ([planPath, packetPath, templatePath].some(fs.existsSync)) throw new Error("V2 review plan or Batch 3 material exists; overwrite refused");
  fs.mkdirSync(batchDirectory, { recursive: true }); const contents = [canonicalJson(plan), canonicalJson(packet), template] as const, targets = [planPath, packetPath, templatePath] as const, token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, temporaries = targets.map((target) => `${target}.${token}.partial`) as [string, string, string];
  try { temporaries.forEach((temporary, index) => fs.writeFileSync(temporary, contents[index], { flag: "wx" })); publish(temporaries[0], targets[0], temporaries[1], targets[1], temporaries[2], targets[2]); targets.forEach((target, index) => { if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== contents[index]) throw new Error("Incomplete V2 review plan or Batch 3 publication"); }); return { planPath, packetPath, templatePath, planSha256: sha(contents[0]), packetSha256: sha(contents[1]), templateSha256: sha(contents[2]) }; }
  catch (error) { targets.forEach((target, index) => { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === contents[index]) fs.rmSync(target, { force: true }); }); throw error; } finally { temporaries.forEach((temporary) => fs.rmSync(temporary, { force: true })); }
};

type PairPublisher = (packetTemporary: string, packetTarget: string, templateTemporary: string, templateTarget: string) => void;
const defaultPairPublisher: PairPublisher = (packetTemporary, packetTarget, templateTemporary, templateTarget) => { fs.renameSync(packetTemporary, packetTarget); fs.renameSync(templateTemporary, templateTarget); };
export const publishMhsV2ReviewBatchMaterials = (universe: MhsV2ReviewUniverseArtifact, candidate: MhsV2ExpansionCandidateArtifact, packet: MhsV2ReviewBatchPacketArtifact, template: string, reviewDirectory: string, publish: PairPublisher = defaultPairPublisher): { packetPath: string; templatePath: string; packetSha256: string; templateSha256: string } => {
  validateMhsV2ReviewBatchPacket(packet, universe, candidate); validateBlankMhsV2ReviewDecisionTemplate(template, packet);
  const batchDirectory = path.join(reviewDirectory, `batch-${String(packet.batchNumber).padStart(2, "0")}`), packetPath = path.join(batchDirectory, batchPacketFilename(packet.batchNumber)), templatePath = path.join(batchDirectory, batchTemplateFilename(packet.batchNumber));
  if (fs.existsSync(packetPath) || fs.existsSync(templatePath)) throw new Error("V2 review batch material exists; overwrite refused");
  fs.mkdirSync(batchDirectory, { recursive: true }); const packetText = canonicalJson(packet), token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, packetTemporary = `${packetPath}.${token}.partial`, templateTemporary = `${templatePath}.${token}.partial`;
  try { fs.writeFileSync(packetTemporary, packetText, { flag: "wx" }); fs.writeFileSync(templateTemporary, template, { flag: "wx" }); publish(packetTemporary, packetPath, templateTemporary, templatePath); if (!fs.existsSync(packetPath) || !fs.existsSync(templatePath) || fs.readFileSync(packetPath, "utf8") !== packetText || fs.readFileSync(templatePath, "utf8") !== template) throw new Error("Incomplete V2 review batch publication"); return { packetPath, templatePath, packetSha256: sha(packetText), templateSha256: sha(template) }; }
  catch (error) { if (fs.existsSync(packetPath) && fs.readFileSync(packetPath, "utf8") === packetText) fs.rmSync(packetPath, { force: true }); if (fs.existsSync(templatePath) && fs.readFileSync(templatePath, "utf8") === template) fs.rmSync(templatePath, { force: true }); throw error; }
  finally { fs.rmSync(packetTemporary, { force: true }); fs.rmSync(templateTemporary, { force: true }); }
};

export const publishMhsV2CompletedReviewAndImport = (completedCsv: string, completedFilename: string, artifact: MhsV2ReviewBatchImportArtifact, outputDirectory: string, publish: PairPublisher = defaultPairPublisher): { completedPath: string; artifactPath: string; completedSha256: string; artifactSha256: string } => {
  validateMhsV2ReviewBatchImport(artifact); const completedPath = path.join(outputDirectory, path.basename(completedFilename)), artifactPath = path.join(outputDirectory, batchImportFilename(artifact.batchNumber));
  if (artifact.completedInputFilename !== path.basename(completedFilename) || artifact.completedInputSha256 !== sha(completedCsv)) throw new Error("Completed Reviewer A CSV does not match validated import authority");
  if (fs.existsSync(completedPath) || fs.existsSync(artifactPath)) throw new Error("Reviewer A completed CSV or validated import exists; overwrite refused");
  fs.mkdirSync(outputDirectory, { recursive: true }); const artifactText = canonicalJson(artifact), token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`, completedTemporary = `${completedPath}.${token}.partial`, artifactTemporary = `${artifactPath}.${token}.partial`;
  try { fs.writeFileSync(completedTemporary, completedCsv, { flag: "wx" }); fs.writeFileSync(artifactTemporary, artifactText, { flag: "wx" }); publish(completedTemporary, completedPath, artifactTemporary, artifactPath); if (!fs.existsSync(completedPath) || !fs.existsSync(artifactPath) || fs.readFileSync(completedPath, "utf8") !== completedCsv || fs.readFileSync(artifactPath, "utf8") !== artifactText) throw new Error("Incomplete Reviewer A completion publication"); return { completedPath, artifactPath, completedSha256: sha(completedCsv), artifactSha256: sha(artifactText) }; }
  catch (error) { if (fs.existsSync(completedPath) && fs.readFileSync(completedPath, "utf8") === completedCsv) fs.rmSync(completedPath, { force: true }); if (fs.existsSync(artifactPath) && fs.readFileSync(artifactPath, "utf8") === artifactText) fs.rmSync(artifactPath, { force: true }); throw error; }
  finally { fs.rmSync(completedTemporary, { force: true }); fs.rmSync(artifactTemporary, { force: true }); }
};

type AtomicPublisher = (temporary: string, target: string) => void;
export const publishMhsV2ReviewBatchImport = (artifact: MhsV2ReviewBatchImportArtifact, outputDirectory: string, publish: AtomicPublisher = fs.renameSync): string => { validateMhsV2ReviewBatchImport(artifact); const target = path.join(outputDirectory, batchImportFilename(artifact.batchNumber)); if (fs.existsSync(target)) throw new Error("Reviewer A batch import exists; overwrite refused"); fs.mkdirSync(outputDirectory, { recursive: true }); const serialized = canonicalJson(artifact), temporary = `${target}.${process.pid}-${crypto.randomBytes(8).toString("hex")}.partial`; try { fs.writeFileSync(temporary, serialized, { flag: "wx" }); publish(temporary, target); if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) throw new Error("Incomplete Reviewer A batch import publication"); return target; } catch (error) { if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === serialized) fs.rmSync(target, { force: true }); throw error; } finally { fs.rmSync(temporary, { force: true }); } };

export interface MhsV2ReviewAuthorityPaths { readonly design: string; readonly proposal: string; readonly candidate: string; readonly acquisition: string; readonly policy: string; readonly screening: string; readonly automaticDisposition: string; readonly completedPrivacyInput: string; readonly privacyDisposition: string; readonly v1Candidate: string; readonly splitManifest: string; readonly internalTestFreeze: string }
export const assertMhsV2ReviewAuthorityHashes = (paths: MhsV2ReviewAuthorityPaths): void => { const checks: readonly [string, string][] = [[paths.design, MHS_TRAIN_EXPANSION_DESIGN_SHA256], [paths.proposal, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_SHA256], [paths.candidate, MHS_V2_EXPANSION_CANDIDATE_SHA256], [paths.acquisition, MHS_V2_EXPANSION_ACQUISITION_SHA256], [paths.policy, TEXT_MODERATION_PII_POLICY_SHA256], [paths.screening, MHS_V2_EXPANSION_PII_SCREENING_SHA256], [paths.automaticDisposition, MHS_V2_EXPANSION_PII_DISPOSITION_SHA256], [paths.completedPrivacyInput, MHS_V2_HUMAN_PII_COMPLETED_INPUT_SHA256], [paths.privacyDisposition, MHS_V2_HUMAN_PII_FINAL_SHA256], [paths.v1Candidate, MHS_CANDIDATE_ARTIFACT_SHA256], [paths.splitManifest, MHS_SPLIT_MANIFEST_SHA256], [paths.internalTestFreeze, MHS_INTERNAL_TEST_FREEZE_SHA256]]; checks.forEach(([filename, expected]) => { if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 authority mismatch: ${path.basename(filename)}`); }); };
