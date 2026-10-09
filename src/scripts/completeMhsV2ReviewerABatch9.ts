import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { PILOT_REVIEW_REASON_CODES, REVIEW_CATEGORIES, REVIEW_DECISIONS } from "../research/textModerationDataset/mhsReviewPilot";
import { MhsV2ExpansionCandidateArtifact } from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import * as reviewAuthority from "../research/textModerationDataset/mhsV2ExpansionReviewerA";

const root = process.cwd();
const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const expansion = path.join(mhs, "expansion");
const review = path.join(expansion, "review");
const batch = (number: number): string => path.join(review, `batch-${String(number).padStart(2, "0")}`);
const completedFilename = "mhs-v2-expansion-review-decisions-batch-09-v1-completed.csv";
const completed = (number: number): string => path.join(batch(number), `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1-completed.csv`);
const paths: Record<string, string> = {
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"), proposal: path.join(expansion, "mhs-train-expansion-tranche-proposal-v1.json"), candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"), screening: path.join(expansion, "pii/mhs-v2-expansion-pii-screening-v1.json"), automaticDisposition: path.join(expansion, "pii/mhs-v2-expansion-pii-disposition-v1.json"), completedPrivacyInput: path.join(expansion, "pii/mhs-v2-expansion-human-pii-decisions-v1-completed.csv"), privacyDisposition: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"), v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), universe: path.join(review, reviewAuthority.MHS_V2_REVIEW_UNIVERSE_FILENAME), plan: path.join(review, reviewAuthority.MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap((number) => [[`batch${number}Packet`, path.join(batch(number), reviewAuthority.batchPacketFilename(number))], [`batch${number}Template`, path.join(batch(number), reviewAuthority.batchTemplateFilename(number))], [`batch${number}Completed`, completed(number)], [`batch${number}Import`, path.join(batch(number), reviewAuthority.batchImportFilename(number))]])),
  batch9Packet: path.join(batch(9), reviewAuthority.batchPacketFilename(9)), batch9Template: path.join(batch(9), reviewAuthority.batchTemplateFilename(9)),
};
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const assertHash = (filename: string, expected: string): void => { if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 Batch 9 completion authority mismatch: ${path.basename(filename)}`); };
reviewAuthority.assertMhsV2ReviewAuthorityHashes(paths as unknown as reviewAuthority.MhsV2ReviewAuthorityPaths);
assertHash(paths.universe, reviewAuthority.MHS_V2_REVIEW_UNIVERSE_SHA256);
assertHash(paths.plan, reviewAuthority.MHS_V2_REVIEW_BATCH_PLAN_SHA256);
const predecessorHashes: readonly (readonly [string, string, string, string])[] = [
  [reviewAuthority.MHS_V2_REVIEW_BATCH_01_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_01_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_01_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_01_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_02_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_02_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_02_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_02_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_03_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_03_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_03_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_03_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_04_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_04_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_04_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_04_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_05_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_05_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_05_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_06_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_06_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_06_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_06_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_07_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_07_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_07_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_07_IMPORT_SHA256],
  [reviewAuthority.MHS_V2_REVIEW_BATCH_08_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_08_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_08_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_08_IMPORT_SHA256],
];
predecessorHashes.forEach((hashes, index) => ["Packet", "Template", "Completed", "Import"].forEach((suffix, item) => assertHash(paths[`batch${index + 1}${suffix}`], hashes[item])));
assertHash(paths.batch9Packet, reviewAuthority.MHS_V2_REVIEW_BATCH_09_PACKET_SHA256);
assertHash(paths.batch9Template, reviewAuthority.MHS_V2_REVIEW_BATCH_09_TEMPLATE_SHA256);
const protectedPaths = Object.values(paths);
const beforeHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact;
const universe = JSON.parse(fs.readFileSync(paths.universe, "utf8")) as reviewAuthority.MhsV2ReviewUniverseArtifact;
const plan = JSON.parse(fs.readFileSync(paths.plan, "utf8")) as reviewAuthority.MhsV2ReviewBatchPlanArtifact;
const packet = JSON.parse(fs.readFileSync(paths.batch9Packet, "utf8")) as reviewAuthority.MhsV2ReviewBatchPacketArtifact;
const template = fs.readFileSync(paths.batch9Template, "utf8");
reviewAuthority.validateMhsV2ReviewUniverse(universe);
reviewAuthority.validateMhsV2ReviewBatchPlan(plan, universe);
reviewAuthority.validateMhsV2ReviewBatchPacket(packet, universe, candidate);
reviewAuthority.validateBlankMhsV2ReviewDecisionTemplate(template, packet);
const planned = plan.batches[8];
if (!planned || planned.batchId !== "MHS_V2_REVIEW_BATCH_09_V1" || planned.startOrdinal !== 311 || planned.endOrdinal !== 355 || planned.memberCount !== 45 || packet.batchId !== planned.batchId || packet.batchNumber !== 9 || packet.generatedAt !== reviewAuthority.MHS_V2_REVIEW_UNIVERSE_GENERATED_AT || packet.memberCount !== 45 || packet.rows.length !== 45 || new Set(packet.rows.map((row) => row.candidateId)).size !== 45 || new Set(packet.rows.map((row) => row.textSha256)).size !== 45 || packet.membershipDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_09_MEMBERSHIP_DIGEST || packet.packetPayloadDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_09_PACKET_PAYLOAD_DIGEST || packet.rows.some((row, index) => row.candidateId !== universe.members[310 + index]?.candidateId || row.textSha256 !== universe.members[310 + index]?.textSha256)) throw new Error("Batch 9 frozen packet authority or positional binding mismatch");
for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) reviewAuthority.validateMhsV2ReviewBatchImport(JSON.parse(fs.readFileSync(paths[`batch${number}Import`], "utf8")) as reviewAuthority.MhsV2ReviewBatchImportArtifact);
const priorPackets = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => JSON.parse(fs.readFileSync(paths[`batch${number}Packet`], "utf8")) as reviewAuthority.MhsV2ReviewBatchPacketArtifact);
const priorIds = new Set(priorPackets.flatMap((prior) => prior.rows.map((row) => row.candidateId)));
if (packet.rows.some((row) => priorIds.has(row.candidateId))) throw new Error("Batch 9 overlaps a predecessor batch");

const reviewedAt = reviewAuthority.MHS_V2_REVIEW_BATCH_09_AUTHORITY_RECONCILED_AT;
const base = { reviewerNote: null, reviewerId: "reviewer_a_01", independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS", reviewedAt } as const;
const allow = (reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "ALLOW", primaryCategory: null, secondaryCategories: [], reasonCode });
const block = (primaryCategory: NonNullable<reviewAuthority.MhsV2ReviewerAHumanInput["primaryCategory"]>, secondaryCategories: reviewAuthority.MhsV2ReviewerAHumanInput["secondaryCategories"], reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "BLOCK", primaryCategory, secondaryCategories, reasonCode });
const supplied = new Map<string, { readonly textSha256: string; readonly input: reviewAuthority.MhsV2ReviewerAHumanInput }>([
  ["src_d2bc75a39abc25ec10d63e238fad6f1597d1d1f4ddef63b84082354cee45003c", { textSha256: "b2ce0e56621a479fe48266a7c5ed97c21ba999af85baf28ca15805273272f63f", input: allow("POLICY_ACCEPTABLE") }],
  ["src_d528741a1e1ce7d9a2dfe56f1c4834f69174f2dacb35b09008534e415168aeca", { textSha256: "01729a8d7bec1414cb48cf60cb6a50bb84c414c6f278465b1fb940e40e785395", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_d53b043f957d7f98f9dc50f5ea20a32a566743328883720721ac54b36bf769c6", { textSha256: "af8736250d4ad36db677fe05c85368352d9c99ad8d021a3f3fff0ffb000c6997", input: allow("BENIGN_CONTEXT") }],
  ["src_d563548ab4148246aa543b34c959b4c82e5c86a5a1a6f922fc3eba3ba7eebb72", { textSha256: "f31afa98ec70d18aacc94f27a5df69dbd781588449b4772fadd329a4ceceaad0", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "DIRECT_PROFANITY") }],
  ["src_d58081538cdbda819ff1159336a179742b6cc595d08cb67026d08f451448fb33", { textSha256: "7a6ccf25f4ec8827986cd5ed43b8d3542637bfa7cda8fd1760418b9b038918fa", input: block("PROFANITY", ["SEXUAL"], "DIRECT_PROFANITY") }],
  ["src_d58afddf3cd5a6f73e09425e956daa61c8cd196f70dce238e57fc33eac97e81a", { textSha256: "6939eb794de18ca8fcf0a24680f70717daad6710b5bb5a148a03fd62d707a8fb", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_d5b7bed702ba9f7d41a15bac7bfba39eb58436d5503897568690673761630704", { textSha256: "575ff86640b77680163148bea9d365ebce5b95c066b3e10220671df53f116921", input: allow("POLICY_ACCEPTABLE") }],
  ["src_d5bf6f46daafd254fc53c2ed81ea9a2b1ef9b42a78094e9168162e29c644270c", { textSha256: "495e078c585d4d541c722adfdb2c8ccb7c14df904d9ac1fd08dfc2763ee10292", input: allow("POLICY_ACCEPTABLE") }],
  ["src_d6a55bcebb43fd9a7ec83dee5ebc32afa398d61344432f1d5dc2988ba4c92711", { textSha256: "f5afc74154c6ae6ea4aaf42e9c43e31e2ae6c95d40c1395fbe42662c591c1b45", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_d6b2bac603344c58a68a0b610f6bcef57ffe463e247e0ba5d0878e22e6501e7c", { textSha256: "bbe879c6d418114bb23e32838fcbbba9df5a609f5d581935e8d4a2ffa6256b75", input: allow("POLICY_ACCEPTABLE") }],
  ["src_d6b61c5e67d3bfdd81d08ee301c913b27085a01ea970aa08c02ca76c6ef27d03", { textSha256: "41997805ebc6c4aefbd0cbf1981910abadd07e2b3229204848a4a4a3d1d87955", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_d6ea793d2cb9279faffdef91637d93d91f2cf74f8e913c0c22df8242ec18642c", { textSha256: "7038d3481f70f9a140c64e152735dc5b013accf0135b0b210826cc66f66b5758", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_d8a1fd0b4be92e5dc9eed1ad0d77c2453915de87edb8715998605f1454f324d9", { textSha256: "6101328fdbf281572ebda2bfd5fe4bf0648e1fe0d92716b33710624cb6f7f01c", input: allow("BENIGN_CONTEXT") }],
  ["src_d8d33bfe9a523e612b9092ee07a48ede1387f44e03cea5a223bea6f4eb6c7146", { textSha256: "481bdd4dc07eb2c765f52c8a05924c9b468a0b4b08bff0a551c868cbacabfaec", input: block("PROFANITY", ["SEXUAL"], "DIRECT_PROFANITY") }],
  ["src_d8ff2b44f43041ba2105cdb07b77736e61efa4c3c521cae8417263da68cdad8b", { textSha256: "2ba54bee96ec9ba61f5a9d06619f8e6343aca9685b23e5dbe159857eb6eb01f2", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_d9384424c89c4650f46891794b3721302cff36a87d1cf26fd1b324fea44ba3e0", { textSha256: "fe13afb43bde425a4191e6a2595cb5a6592774091daf5a6297f01e98e0695214", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_d9defd82e3e677f7c98fc21b5a00517b50d2b383291a4aff34c1358eec7c16d6", { textSha256: "8a13aa7a163c05e204a79bc681c3d852bef4d2f8055fbdd0f1f7ebf0ff42a342", input: block("THREAT_OR_VIOLENCE", [], "THREAT_OR_VIOLENCE") }],
  ["src_da2950189d540d90894d62fe9fd4ac679f55ed674ea5d3bdf22d9d61c4a6f8b9", { textSha256: "1f5326fd63a18ed75a121f54aeb3d2e9e230254eb5c7c346886c8331d3259b4f", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_dafaf3287bcfe353cfee690ef57b66bb82b86544ac49db76949ef39e5d17fb7a", { textSha256: "fac517bcd2326917d46f3f672c0317272c64047cf46164a7462adae944bba106", input: allow("BENIGN_CONTEXT") }],
  ["src_db334fa4e8631e8f30d784370ebb6c2b3dfa23caa69e16158ae4c0496e4c1966", { textSha256: "6ed74aa5ccfa4750ac85a5cf3b7a9a646d4123632f0a334d0a0733fe3bbe1945", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_dc25e115b6797325fb79b5e14957fa590c6cec8e3a428810b6c7eca0a6568309", { textSha256: "ad0efab02040a396d05336df8d26888b08e3af0123586e3f837841f86dfbf0d2", input: block("SEXUAL", ["PROFANITY"], "SEXUAL_CONTENT") }],
  ["src_dc8ea30daf0c96bf66dd2658ee75b5e05aef84b7d6103316775b7dd3b26136b8", { textSha256: "8d2b754c031632cd7b8bab6cafd3b4a6dc935b5c70b3ae6607726c5e3ba911f7", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_dccab036da84ec554bf103720ab9bcc2ffa73671c764f556bf62984acdfc184a", { textSha256: "81186043f9dea2dd5a7272051d4259c8bb78de6d3795ec33695ca85069f6dd8b", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_dd8abf45637ba1c0d7f0080ab3f9d68cc5cee98813ec65e83797f19bf66e2899", { textSha256: "9fd546f208f7f38a231fd0283f51f76016efbd4df3890812cae7ae35664cb1f5", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_e06391c9b49d460cc6b48957ee818c9b30c4f545a0846b1d4fc3a139ebbe1705", { textSha256: "ef6eb302ac04ec8ce1332b123509b75d948013eb689d486fdf41e42548375726", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_e147ade2a54f58be8d98e0a3b9d9f0252036e21a873ec0ca2b950ba2a3491632", { textSha256: "b0b1ab04753a826143ed08232615575a000c209b179775e457d991a0c87d448d", input: allow("POLICY_ACCEPTABLE") }],
  ["src_e2cc68950cfda258079f3174afa8a851a78ac20e485b83ec1d7faa6765cc576a", { textSha256: "2de232c65965ba73d52d80e1e3c76a4883166297e5d774266006f0ec349fcf8c", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_e2e39021c2dc66b2e4969879743efdfe32720936b4f1be31d77ddedea7ecf5ae", { textSha256: "649e7cf62bee4ac1e5dcaa8e10f4482552422d2ddebf8275cc8b1f5b405247e9", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_e2f6175525613063a8b61f6efc6ae6c0b2b029dc842166e72140cc471e488ec4", { textSha256: "054ba73f6ddf8bfe923bb9e5f135f3b66baf05ac57e0576171c95f48a0bfe91f", input: block("OTHER_INAPPROPRIATE", [], "BENIGN_CONTEXT") }],
  ["src_e32adb0d3037b69bf80011ad3295641030207dbb04c93870c6ea7fcefad4b774", { textSha256: "aaf373fbc09154032e2322d9fd29ae07e58cce8adca98f0de5c4714a372522be", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_e37366b1bd49b9760e072ed718c8872e806bd90345c13506824fc48061b98bd6", { textSha256: "803f860cadd4219e93e1c4d47fb56ec28cc18a14fb8ea8b9c7f1cb741bb1589b", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_e408f24ca6a3227597cbe03b9f9db56b4bc9e5fc545323fc9996547b81afaff4", { textSha256: "6842f64c7139a05dbb1bdbc34cc918cc45bd925849810975e1f60907b587bdd2", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_e4256e93f9658d325f1f1b3dd90bc586b8e7bf03de0b28b5804b519e13e8a173", { textSha256: "ca90de3c9ecb8217912fe31aae93d34f2955d918e71bf88562020b66aad59e0a", input: allow("POLICY_ACCEPTABLE") }],
  ["src_e49ad87ad64aed31fccf2d15f43365aa4958fe1e418ead7ed7dac3dd0a932de7", { textSha256: "7ba69442418a28cc8b003682e7d043753492e560394e7d3dfa67336bb2fd499f", input: allow("BENIGN_CONTEXT") }],
  ["src_e51a95b88e7ba466cee81b7350ac35ee55755f91a87ca67ffb90fe9a060ad4b5", { textSha256: "31a1f55b001f8897355a5c3d965c5fe94c12e37253479321efb5bd14beb27976", input: block("HATE", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_e5274c65838a163ed773c55309933f171dd5d46278b8dc27094302d0950f83f8", { textSha256: "a8f2cceae36a4a7f5e1583bdc91fbec300d274275ad05427e07665ae18f07371", input: block("ABUSIVE_OR_HARASSING", [], "TARGETED_ABUSE") }],
  ["src_e5a38572801afb29f40d4715a2f03640a599648e22676b07e2fde0e81bcca7ae", { textSha256: "a0fd36aabf6601257c0d5a9e1e53cc947a76d92e35f8fc07405d5a1f5f495e21", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_e669e622725bc1504d89eef19a4bea5720ff103a16fd9394fe2a2355595ef024", { textSha256: "d99709c38b5a17a3784681e55e6d366951d350aa1a17eef9cfa2fdecce2dd2ab", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_e66f27c4671ae75dd36ed3435143a74d4a4f64c979eb02223419385134cb224b", { textSha256: "861201e46e56ab7ff87efb6f22cf3814d746969abe3aca699d606c9946548655", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_e6aad0824360e2dba165b4c1799a6c05b53a19ee2387659ada46402471f6de74", { textSha256: "66516ba51dcfd5c01ac5bd38fd7f3e77cd720d8db57ead17fbef028fe437c036", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "DIRECT_PROFANITY") }],
  ["src_e82f859807f805130fd560cebf3e0bdc6335cb6e9bf4538a8a8196336b13ae65", { textSha256: "db148e04b7ac78f042bb5b095d6b1c3774d7f1dd795f8822e33c57a144648341", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_e88721e6ab5ecf1b1f69041f40f69c283c00302efb17d81020c8e63a480fbaaa", { textSha256: "06d168c64c8dd6502063b23e80f3d6fcfd4295d58f673d107b67826ed04415ab", input: block("PROFANITY", ["HATE"], "DIRECT_PROFANITY") }],
  ["src_e8b3bbf8ad16a8cde3899f4b78e3eadc5c90708773527a1814b83bfe1eab3be5", { textSha256: "fca91d9eee213d56152954f66424b23aa0ab2293d22ec5f22df2f30f2c2b8777", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_e8dcc22ab3d14838fcb4dd31f76adfdc2fec393c5d5ebda91bfc1dc4bb1fcef8", { textSha256: "68c59e2ec537ea4c3fb09a932d36c5e64025632b5ab84d67c1f3c8581a26fe07", input: block("OTHER_INAPPROPRIATE", [], "OTHER_POLICY_MISMATCH") }],
  ["src_e97608830cd89f60aa74788f0848014b0f5f77aa2f76c0248a694959437189d7", { textSha256: "c5bef514658e956ca352d4fd5abd4d83ca11db1f149e1ded5344e43b66d2163f", input: block("PROFANITY", ["SEXUAL"], "SEXUAL_CONTENT") }],
]);
const packetIds = new Set(packet.rows.map((row) => row.candidateId));
const unknown = [...supplied.keys()].filter((candidateId) => !packetIds.has(candidateId));
const missing = packet.rows.filter((row) => !supplied.has(row.candidateId));
const decisions = packet.rows.map((row) => { const suppliedRow = supplied.get(row.candidateId); if (!suppliedRow || suppliedRow.textSha256 !== row.textSha256) throw new Error(`Batch 9 Reviewer A binding mismatch: ${row.candidateId}`); return { candidateId: row.candidateId, textSha256: row.textSha256, ...suppliedRow.input }; });
if (supplied.size !== 45 || decisions.length !== 45 || unknown.length !== 0 || missing.length !== 0 || new Set(decisions.map((row) => row.candidateId)).size !== 45 || new Set(decisions.map((row) => row.textSha256)).size !== 45 || decisions.some((row) => !Number.isFinite(Date.parse(row.reviewedAt)))) throw new Error("Batch 9 Reviewer A membership or metadata reconciliation failed");
const count = (values: readonly string[], allowed: readonly string[]): Record<string, number> => Object.fromEntries(allowed.map((value) => [value, values.filter((item) => item === value).length]));
const decisionCounts = count(decisions.map((row) => row.decision), REVIEW_DECISIONS);
const primaryCategoryCounts = count(decisions.flatMap((row) => row.primaryCategory === null ? [] : [row.primaryCategory]), REVIEW_CATEGORIES);
const secondaryCategoryCounts = { NONE: decisions.filter((row) => row.decision === "BLOCK" && row.secondaryCategories.length === 0).length, ...count(decisions.flatMap((row) => row.secondaryCategories), REVIEW_CATEGORIES) };
const reasonCodeCounts = count(decisions.map((row) => row.reasonCode), PILOT_REVIEW_REASON_CODES);
if (canonicalJson(decisionCounts) !== canonicalJson({ ALLOW: 18, BLOCK: 27, NEEDS_ADJUDICATION: 0, EXCLUDE: 0 }) || canonicalJson(primaryCategoryCounts) !== canonicalJson({ PROFANITY: 14, SEXUAL: 5, ABUSIVE_OR_HARASSING: 1, HATE: 1, THREAT_OR_VIOLENCE: 4, OTHER_INAPPROPRIATE: 2 }) || canonicalJson(secondaryCategoryCounts) !== canonicalJson({ NONE: 15, PROFANITY: 1, SEXUAL: 3, ABUSIVE_OR_HARASSING: 4, HATE: 4, THREAT_OR_VIOLENCE: 0, OTHER_INAPPROPRIATE: 0 }) || canonicalJson(reasonCodeCounts) !== canonicalJson({ POLICY_ACCEPTABLE: 6, DIRECT_PROFANITY: 12, SEXUAL_CONTENT: 6, TARGETED_ABUSE: 3, PROTECTED_GROUP_HATE: 0, THREAT_OR_VIOLENCE: 4, COUNTERSPEECH_OR_REPORTING: 8, BENIGN_CONTEXT: 5, INSUFFICIENT_CONTEXT: 0, PII_OR_DATA_QUALITY: 0, OTHER_POLICY_MISMATCH: 1, OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION: 0 })) throw new Error("Batch 9 mechanically derived aggregate reconciliation mismatch");
const completedInputs: readonly reviewAuthority.MhsV2ReviewerAHumanInput[] = decisions.map((row) => ({ decision: row.decision, primaryCategory: row.primaryCategory, secondaryCategories: row.secondaryCategories, reasonCode: row.reasonCode, reviewerNote: row.reviewerNote, reviewerId: row.reviewerId, independenceDeclaration: row.independenceDeclaration, reviewedAt: row.reviewedAt }));
const completedCsv = reviewAuthority.createCompletedMhsV2ReviewDecisionCsv(packet, completedInputs);
const parsed = reviewAuthority.parseCompletedMhsV2ReviewBatch(completedCsv, packet);
if (canonicalJson(parsed) !== canonicalJson(decisions)) throw new Error("Batch 9 completed CSV did not preserve Reviewer A authority");
const artifact = reviewAuthority.createMhsV2ReviewBatchImport(universe, packet, completedCsv, completedFilename, reviewAuthority.MHS_V2_REVIEW_BATCH_09_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_09_IMPORTED_AT);
const published = reviewAuthority.publishMhsV2CompletedReviewAndImport(completedCsv, completedFilename, artifact, batch(9));
const afterHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
if (canonicalJson(beforeHashes) !== canonicalJson(afterHashes)) throw new Error("Protected authority changed during Batch 9 completion");
console.log(JSON.stringify({ ...published, payloadIntegrityDigest: artifact.payloadIntegrityDigest, batchId: artifact.batchId, startOrdinal: planned.startOrdinal, endOrdinal: planned.endOrdinal, rowCount: artifact.rowCount, uniqueCandidateCount: new Set(decisions.map((row) => row.candidateId)).size, uniqueTextShaCount: new Set(decisions.map((row) => row.textSha256)).size, membershipDigest: artifact.membershipDigest, decisionCounts, primaryCategoryCounts, secondaryCategoryCounts, reasonCodeCounts, reviewerId: artifact.reviewerId, reviewedAt, missingCount: missing.length, duplicateCount: 0, unknownCount: unknown.length, unresolvedDecisionCount: 0, bindingMismatchCount: 0, positionMismatchCount: 0, protectedArtifactCount: protectedPaths.length, upstreamHashesBefore: beforeHashes, upstreamHashesAfter: afterHashes, nextAction: "STOP_AFTER_BATCH_9; DO_NOT_BEGIN_BATCH_10" }, null, 2));
