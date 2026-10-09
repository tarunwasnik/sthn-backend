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
const completedFilename = "mhs-v2-expansion-review-decisions-batch-10-v1-completed.csv";
const completed = (number: number): string => path.join(batch(number), `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1-completed.csv`);
const paths: Record<string, string> = {
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"), proposal: path.join(expansion, "mhs-train-expansion-tranche-proposal-v1.json"), candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"), screening: path.join(expansion, "pii/mhs-v2-expansion-pii-screening-v1.json"), automaticDisposition: path.join(expansion, "pii/mhs-v2-expansion-pii-disposition-v1.json"), completedPrivacyInput: path.join(expansion, "pii/mhs-v2-expansion-human-pii-decisions-v1-completed.csv"), privacyDisposition: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"), v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), universe: path.join(review, reviewAuthority.MHS_V2_REVIEW_UNIVERSE_FILENAME), plan: path.join(review, reviewAuthority.MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((number) => [[`batch${number}Packet`, path.join(batch(number), reviewAuthority.batchPacketFilename(number))], [`batch${number}Template`, path.join(batch(number), reviewAuthority.batchTemplateFilename(number))], [`batch${number}Completed`, completed(number)], [`batch${number}Import`, path.join(batch(number), reviewAuthority.batchImportFilename(number))]])),
  batch10Packet: path.join(batch(10), reviewAuthority.batchPacketFilename(10)), batch10Template: path.join(batch(10), reviewAuthority.batchTemplateFilename(10)),
};
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const assertHash = (filename: string, expected: string): void => { if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 Batch 10 completion authority mismatch: ${path.basename(filename)}`); };
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
  [reviewAuthority.MHS_V2_REVIEW_BATCH_09_PACKET_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_09_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_09_COMPLETED_INPUT_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_09_IMPORT_SHA256],
];
predecessorHashes.forEach((hashes, index) => ["Packet", "Template", "Completed", "Import"].forEach((suffix, item) => assertHash(paths[`batch${index + 1}${suffix}`], hashes[item])));
assertHash(paths.batch10Packet, reviewAuthority.MHS_V2_REVIEW_BATCH_10_PACKET_SHA256);
assertHash(paths.batch10Template, reviewAuthority.MHS_V2_REVIEW_BATCH_10_TEMPLATE_SHA256);
const protectedPaths = Object.values(paths);
const beforeHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact;
const universe = JSON.parse(fs.readFileSync(paths.universe, "utf8")) as reviewAuthority.MhsV2ReviewUniverseArtifact;
const plan = JSON.parse(fs.readFileSync(paths.plan, "utf8")) as reviewAuthority.MhsV2ReviewBatchPlanArtifact;
const packet = JSON.parse(fs.readFileSync(paths.batch10Packet, "utf8")) as reviewAuthority.MhsV2ReviewBatchPacketArtifact;
const template = fs.readFileSync(paths.batch10Template, "utf8");
reviewAuthority.validateMhsV2ReviewUniverse(universe);
reviewAuthority.validateMhsV2ReviewBatchPlan(plan, universe);
reviewAuthority.validateMhsV2ReviewBatchPacket(packet, universe, candidate);
reviewAuthority.validateBlankMhsV2ReviewDecisionTemplate(template, packet);
const planned = plan.batches[9];
if (!planned || planned.batchId !== "MHS_V2_REVIEW_BATCH_10_V1" || planned.startOrdinal !== 356 || planned.endOrdinal !== 400 || planned.memberCount !== 45 || packet.batchId !== planned.batchId || packet.batchNumber !== 10 || packet.generatedAt !== reviewAuthority.MHS_V2_REVIEW_UNIVERSE_GENERATED_AT || packet.memberCount !== 45 || packet.rows.length !== 45 || new Set(packet.rows.map((row) => row.candidateId)).size !== 45 || new Set(packet.rows.map((row) => row.textSha256)).size !== 45 || packet.membershipDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_10_MEMBERSHIP_DIGEST || packet.packetPayloadDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_10_PACKET_PAYLOAD_DIGEST || packet.rows.some((row, index) => row.candidateId !== universe.members[355 + index]?.candidateId || row.textSha256 !== universe.members[355 + index]?.textSha256)) throw new Error("Batch 10 frozen packet authority or positional binding mismatch");
for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9]) reviewAuthority.validateMhsV2ReviewBatchImport(JSON.parse(fs.readFileSync(paths[`batch${number}Import`], "utf8")) as reviewAuthority.MhsV2ReviewBatchImportArtifact);
const priorPackets = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => JSON.parse(fs.readFileSync(paths[`batch${number}Packet`], "utf8")) as reviewAuthority.MhsV2ReviewBatchPacketArtifact);
const priorIds = new Set(priorPackets.flatMap((prior) => prior.rows.map((row) => row.candidateId)));
if (packet.rows.some((row) => priorIds.has(row.candidateId))) throw new Error("Batch 10 overlaps a predecessor batch");
if (packet.rows[29]?.candidateId !== "src_fb15c88561fe0e01fa942ec0472719e9726e7c180b6a6b9d57b4e155c8dbc008" || packet.rows[29]?.textSha256 !== "b182373afbccafcdad22e7e7d53959aac1a92973a2587533a8092c39f1c29953" || packet.rows[29]?.text !== "no one fucking cares fag") throw new Error("Batch 10 Position 385 authoritative identity or text mismatch");

const reviewedAt = reviewAuthority.MHS_V2_REVIEW_BATCH_10_AUTHORITY_RECONCILED_AT;
const base = { reviewerNote: null, reviewerId: "reviewer_a_01", independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS", reviewedAt } as const;
const allow = (reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "ALLOW", primaryCategory: null, secondaryCategories: [], reasonCode });
const block = (primaryCategory: NonNullable<reviewAuthority.MhsV2ReviewerAHumanInput["primaryCategory"]>, secondaryCategories: reviewAuthority.MhsV2ReviewerAHumanInput["secondaryCategories"], reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "BLOCK", primaryCategory, secondaryCategories, reasonCode });
const supplied = new Map<string, { readonly textSha256: string; readonly input: reviewAuthority.MhsV2ReviewerAHumanInput }>([
  ["src_e9774746e0fe602fa06096e0dd9820f526fe8ceb60ab7d0a9a632253c9dcf6d4", { textSha256: "4c28b7d530f6615fdcd1c6b7396ad2a79b85672def4e357f45458c6636983b80", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_e9b21bbeb1ad379e49be23f46be4e4c9f3bef8eaebce4e2e4a0f6efee75fe83c", { textSha256: "5891a8bea5c359aedb1b24eee8aaa3cecca53210e77c6560333876292bf0d960", input: allow("POLICY_ACCEPTABLE") }],
  ["src_ea7b2f9f11eddd9986e5bffcef40cc3db61827ed511be1b5a43960dfd895d5fd", { textSha256: "fea93d7c38e0668224c460ffb6a7a30a40892a7ac594e58834ff1ea4d3584905", input: allow("BENIGN_CONTEXT") }],
  ["src_eab5b77e8cb90d6f573df463467e18ef3c67098c41f7959ba2047860db9a82e6", { textSha256: "6e6634cca4c70b8a4b2d8f9b26cd194776ad505048e6d43acf7e78be31ec83c1", input: block("OTHER_INAPPROPRIATE", [], "OTHER_POLICY_MISMATCH") }],
  ["src_eac36944678bb2669b750b8d0053f35f7ef5126a05d408013e735438417486d3", { textSha256: "42e6fa89f0f2dc318b97b70d8282034ec34a402547c9163151ac6430c99ba630", input: allow("BENIGN_CONTEXT") }],
  ["src_ead67c09d1fb7ac32553d0e8fa04ec19576cec87edea533321d3e940fbaa13ef", { textSha256: "07416a1ca5c9c1c3af747b28590af63691983f7a795b12fc5fac284b6147e077", input: block("HATE", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_eb24bab1066f70ad8a5e23c6d9a1dada9f7c89041b1f2a2ce096321d9c3f3797", { textSha256: "b3f3146cb749588fd180ab0a7190fa4429eacd06097c8a2b1c8dd94868b8e88b", input: block("SEXUAL", ["PROFANITY"], "SEXUAL_CONTENT") }],
  ["src_ec33b00794f0c195c15b52b094b8c85a10b4964c277af7abf57975d650d0b408", { textSha256: "7ed7d223fe1e928a67da3df0d2b7742f0e269b9bfd32ee94754e532c5638b248", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_ec6543a5bdeeda36421687832ba8f3ec55a9d0d0d3a232f39ab35f613c781717", { textSha256: "d54ce2e65f525c99e0993068310cf5878d81dc86bb65bfcbaa6119fc8735a5f0", input: block("THREAT_OR_VIOLENCE", [], "THREAT_OR_VIOLENCE") }],
  ["src_eca6ccae44556b50877b495a8a41ff8d130e61ffe6752bd79cc02c4fd8bdd337", { textSha256: "6e349232c54cc0420b8aedfc202eb8a20f7bd23c662d9a4f546dad2f4d590a75", input: block("PROFANITY", ["SEXUAL"], "DIRECT_PROFANITY") }],
  ["src_ed36531f42a5eb1283a45b79274e8d77c41991948829554591974aaca1757c9f", { textSha256: "702bbbe870744882c1dd2098ebed85dcc53c378e9a7a33cf46d01caebf18ac64", input: allow("POLICY_ACCEPTABLE") }],
  ["src_ee32e744a4e3d56ac6c0b0248c792c2b299b48bb2df3c78d1c54a396bd3752e5", { textSha256: "505829db055c5640f8d1b8e1a00d7b42c2000fe2df806f75c7f3739cf798494c", input: allow("BENIGN_CONTEXT") }],
  ["src_eea37620e398217c8fbaea3133b2ec2dc38e194c75d0da30076adf82bb64c2bb", { textSha256: "1fba59fa3608492cf87ab68a56184404a210b5286fb08eeefedceaaae914cd60", input: allow("BENIGN_CONTEXT") }],
  ["src_efa61270255762da50539597c0da7bc237dc75558591410a274fa8cc04608b2b", { textSha256: "da9a81f69757c946fe04d54736cf9f250621209e16be6624241bdf636f00c243", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_f01bf14c04a8a0fac1b32dea348f3902e9944c9d77929f0e00081347d2f4c098", { textSha256: "9111aeaad256a0ef22dc06cbd5e3ae3278232ec02ea77af8cf6be7976cd56d60", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_f0b239d7348125a51cdda4b4adaf8c0719a02571d3b1ce5528c909162522dc1f", { textSha256: "a6953ea37bcfc47584ef8b206ab26848d9ec013ff6ef44ae22c24fefdd0287e5", input: allow("POLICY_ACCEPTABLE") }],
  ["src_f19ee08763b14ccfbd5c5bd6b9ce209b8f9041bafd34273204330f2cf6cf46cb", { textSha256: "f353dd59732a868441bcb566cc178d23b2cc882a9cf6e476b9c0267a2f72a25f", input: block("ABUSIVE_OR_HARASSING", [], "TARGETED_ABUSE") }],
  ["src_f1b4476da4db41c0b6ca09bb83c244e62999a68b800d6bd3217bbfcab28ed6db", { textSha256: "debb2af5e36a750d720281adcc009440dc2d2adffc0a1a7a5fcea36efc5c6e53", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_f1c63d8332fad9219a015de6332bf9a6b262d95e02e41fc8fb3398b6f42f1b6e", { textSha256: "4d374b0afcdf59537bb5bf5a506465cd1e84a2c2efedc7308c84ce462536255b", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_f1d5cedef14a8ab2795123582963db6a87eabea4a374d192f03e1d8cf22176bd", { textSha256: "d2d3a724b0b652b294147d69457023063fbb1cf4d71edc376db5f7b40ec6fef8", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_f423be30623ce681d4e7527f6b8eb77cf359431793ee6d44b25fab91b9c61737", { textSha256: "a1c9a83110dcdaeaa0d578a30a50d70c6f10e811b6d19f2e2fd870c82231270a", input: block("THREAT_OR_VIOLENCE", [], "THREAT_OR_VIOLENCE") }],
  ["src_f4f350561cdcacef6373e06c82a9c5a1ed381c2bff2220aace89e6c5409382b6", { textSha256: "7a941e8b497a5b438878c4c8d1b3900621c3a6a3e82bba88d392f5d8d54390e6", input: allow("BENIGN_CONTEXT") }],
  ["src_f52ba40468c2a29fd73245c775c7814cb0ce77f6001d9127d1689fe5f8df8555", { textSha256: "b8581fdeaa5aba3d298d993a0766f6bb9f07b820c5eed31a1ffce47107115515", input: allow("POLICY_ACCEPTABLE") }],
  ["src_f54003e79c4090934b4125ab35900981271654b54f91c4184607036ea9d5c8d2", { textSha256: "cb05ca5384055f7705c4013e8dee9679489483f241209396590348b64b0d4cc7", input: block("HATE", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_f610420ce59627343945daa5dc9755c322611b893617b423d395e79c41678a2c", { textSha256: "0ba1e60407981547f7268d9ffe12925e405442d1c70ccd1761c60ca7775bd5ea", input: allow("BENIGN_CONTEXT") }],
  ["src_f6d94bd89194b3040acb519848ff88d38cf0de743ac12cd5440209a3861c0f5c", { textSha256: "3ca2e5a23b9c1eeddda967de19e375ba77b7c16ffffb0c82716904f416a7bead", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_f83d3b8118b26af4a188650fd747f06d456713f63cee53aca428a715ffc52aa4", { textSha256: "e27425a554c2b3fc5f5319ebdf9155e5267f341d451f4424b3f94146afa2cd9d", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_f8e59d82ba08e0e7acfbf6aecc0a3e8d3de4bb713fae5ecf5694589e127dff4f", { textSha256: "def38bed20f74b97aa372516b3511c6244548766f1b83feae68f737f5940bb2f", input: allow("BENIGN_CONTEXT") }],
  ["src_fad85a4f6fd8288e36d4b380faa70ec1ebc4c2532cd30e198cbe270617b8b740", { textSha256: "2fb9677f445c68aaf075bc7087726b94c75ce9222e0d9d2e0eaafdf82b694a0e", input: allow("POLICY_ACCEPTABLE") }],
  ["src_fb15c88561fe0e01fa942ec0472719e9726e7c180b6a6b9d57b4e155c8dbc008", { textSha256: "b182373afbccafcdad22e7e7d53959aac1a92973a2587533a8092c39f1c29953", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "DIRECT_PROFANITY") }],
  ["src_fb1ce260fc224da4189f5f96fcf9ea66e297746d8186fb5e12299103b0667b0f", { textSha256: "75b429d173a782e2b42444df68b632e20d3a324efaaafba8cbefe7fadf0e6981", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_fb20482e5d8a9ee2fca95fb86b56ea59721466b96c179493c6da1f37844401b5", { textSha256: "769d85d34b5c95bbeeda7a50ddbf2e2b1b964996e8e927202b67ec4ecff43a86", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_fb57174fca180cf0d45195c8897e4a829a5ed7b255809b1831cfe1e28dec4318", { textSha256: "0d2dcb9b348f2070356abfb61ae6182282d85446a1904174a8c4e1fda119b3ab", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_fb6af66f743cd0379fe599612403088501727d01d4d632a47cee6407f5defe1d", { textSha256: "e0d03eef222ee9d96be46192f3514eb930f527b29c7b62d7e00db7804b98daec", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_fbe216ed4fa6fb31e2a44449340ef9ef733f86d044080901696f844eb242a467", { textSha256: "6207acdaf1866a43234817497ce8432c3a0842db0332bdb795e37227d0868bf0", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_fc6726f154259ce3de030b1763351d5562ac65bc2c1a2b4126d835f3fb1d9031", { textSha256: "fef01963298ee69643f9e1f0b99c622e52b6bc206a637918ff274277415f2f3c", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_fcc5f7bfbd5136d62baa0dc9a87e8589d7ec32ef336838ba502149874e7521b6", { textSha256: "b8afd9187738c9009ca49e534f555975c26fd4d2af17a84399894618f5b3775e", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_fd53cf0705c814177f4b0e7b5847f428586f2617c57949b7367a2da55e062966", { textSha256: "258b7fe8e3b2e76140cd7e0fd8171ab37400e32c27096b561b33a0fa4f5e4059", input: allow("BENIGN_CONTEXT") }],
  ["src_fd9dd126dfcb3e64e2110b6d25d21d590d4d8f15e5393df74db7d1fe97fcb22b", { textSha256: "f81b4dc70053d52a178265f79aa5696de842fb0304b04bae994134945e47e756", input: allow("BENIGN_CONTEXT") }],
  ["src_fda8711871d8e7036e1851d029f87fd9911b52f217e983821e5d86b2335f5fd6", { textSha256: "734cc39c2f5fb3dc399d65980e4cc1888aa457fad58973378950cc3f9719017e", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_fdb70cf67b460cce6d4c615ca07db2bf71c9bb920f13e5cbdd46a494408cd470", { textSha256: "4eb7b1fad36bdd509d68cdf41c93fe58b0cead3a03bb727ab0d4db9d7bd836b0", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_fef761c1bbaaf29938773c74f6cb1a5f666e7d9c068f3348538478131651dcd2", { textSha256: "e410775cd64b33c2f482aef8b23a7247981de2857751a7277e69bcc8d0cf81cd", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_ff53ddcda3a782f3f9f881a6c4f3e6ea514ada7967c52b729700aea078dc9886", { textSha256: "e90dd1d6925d59432ac3c011ebfdb8f153b8b1bbdc581fe4bb593104e526cd27", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_ff742c878ba35f213fe45b0cfbeb40978f5c848ae48d377f32ebcdc0362d96ef", { textSha256: "a4f8f1ebea10f737f0493c4955b2468dea19a3b3a3506a5c436493c2f09ba2cf", input: allow("POLICY_ACCEPTABLE") }],
  ["src_fff11d042f3a1f425c09c4b7bd859868521213043686d3e76fd64ef1a855b2e5", { textSha256: "2fae93f874cde8cfa1cc6548f0562e49fb08d059e49b69268d92fbe97c9e8449", input: allow("POLICY_ACCEPTABLE") }],
]);
const packetIds = new Set(packet.rows.map((row) => row.candidateId));
const unknown = [...supplied.keys()].filter((candidateId) => !packetIds.has(candidateId));
const missing = packet.rows.filter((row) => !supplied.has(row.candidateId));
const decisions = packet.rows.map((row) => { const suppliedRow = supplied.get(row.candidateId); if (!suppliedRow || suppliedRow.textSha256 !== row.textSha256) throw new Error(`Batch 10 Reviewer A binding mismatch: ${row.candidateId}`); return { candidateId: row.candidateId, textSha256: row.textSha256, ...suppliedRow.input }; });
if (supplied.size !== 45 || decisions.length !== 45 || unknown.length !== 0 || missing.length !== 0 || new Set(decisions.map((row) => row.candidateId)).size !== 45 || new Set(decisions.map((row) => row.textSha256)).size !== 45 || decisions.some((row) => !Number.isFinite(Date.parse(row.reviewedAt)))) throw new Error("Batch 10 Reviewer A membership or metadata reconciliation failed");
const count = (values: readonly string[], allowed: readonly string[]): Record<string, number> => Object.fromEntries(allowed.map((value) => [value, values.filter((item) => item === value).length]));
const decisionCounts = count(decisions.map((row) => row.decision), REVIEW_DECISIONS);
const primaryCategoryCounts = count(decisions.flatMap((row) => row.primaryCategory === null ? [] : [row.primaryCategory]), REVIEW_CATEGORIES);
const secondaryCategoryCounts = { NONE: decisions.filter((row) => row.decision === "BLOCK" && row.secondaryCategories.length === 0).length, ...count(decisions.flatMap((row) => row.secondaryCategories), REVIEW_CATEGORIES) };
const reasonCodeCounts = count(decisions.map((row) => row.reasonCode), PILOT_REVIEW_REASON_CODES);
if (canonicalJson(decisionCounts) !== canonicalJson({ ALLOW: 27, BLOCK: 18, NEEDS_ADJUDICATION: 0, EXCLUDE: 0 }) || canonicalJson(primaryCategoryCounts) !== canonicalJson({ PROFANITY: 9, SEXUAL: 2, ABUSIVE_OR_HARASSING: 1, HATE: 2, THREAT_OR_VIOLENCE: 3, OTHER_INAPPROPRIATE: 1 }) || canonicalJson(secondaryCategoryCounts) !== canonicalJson({ NONE: 11, PROFANITY: 1, SEXUAL: 1, ABUSIVE_OR_HARASSING: 4, HATE: 1, THREAT_OR_VIOLENCE: 0, OTHER_INAPPROPRIATE: 0 }) || canonicalJson(reasonCodeCounts) !== canonicalJson({ POLICY_ACCEPTABLE: 7, DIRECT_PROFANITY: 8, SEXUAL_CONTENT: 2, TARGETED_ABUSE: 4, PROTECTED_GROUP_HATE: 0, THREAT_OR_VIOLENCE: 3, COUNTERSPEECH_OR_REPORTING: 11, BENIGN_CONTEXT: 9, INSUFFICIENT_CONTEXT: 0, PII_OR_DATA_QUALITY: 0, OTHER_POLICY_MISMATCH: 1, OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION: 0 })) throw new Error("Batch 10 mechanically derived aggregate reconciliation mismatch");
const completedInputs: readonly reviewAuthority.MhsV2ReviewerAHumanInput[] = decisions.map((row) => ({ decision: row.decision, primaryCategory: row.primaryCategory, secondaryCategories: row.secondaryCategories, reasonCode: row.reasonCode, reviewerNote: row.reviewerNote, reviewerId: row.reviewerId, independenceDeclaration: row.independenceDeclaration, reviewedAt: row.reviewedAt }));
const completedCsv = reviewAuthority.createCompletedMhsV2ReviewDecisionCsv(packet, completedInputs);
const parsed = reviewAuthority.parseCompletedMhsV2ReviewBatch(completedCsv, packet);
if (canonicalJson(parsed) !== canonicalJson(decisions)) throw new Error("Batch 10 completed CSV did not preserve Reviewer A authority");
const artifact = reviewAuthority.createMhsV2ReviewBatchImport(universe, packet, completedCsv, completedFilename, reviewAuthority.MHS_V2_REVIEW_BATCH_10_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_10_IMPORTED_AT);
const published = reviewAuthority.publishMhsV2CompletedReviewAndImport(completedCsv, completedFilename, artifact, batch(10));
const afterHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
if (canonicalJson(beforeHashes) !== canonicalJson(afterHashes)) throw new Error("Protected authority changed during Batch 10 completion");
console.log(JSON.stringify({ ...published, payloadIntegrityDigest: artifact.payloadIntegrityDigest, batchId: artifact.batchId, startOrdinal: planned.startOrdinal, endOrdinal: planned.endOrdinal, rowCount: artifact.rowCount, uniqueCandidateCount: new Set(decisions.map((row) => row.candidateId)).size, uniqueTextShaCount: new Set(decisions.map((row) => row.textSha256)).size, membershipDigest: artifact.membershipDigest, decisionCounts, primaryCategoryCounts, secondaryCategoryCounts, reasonCodeCounts, reviewerId: artifact.reviewerId, reviewedAt, missingCount: missing.length, duplicateCount: 0, unknownCount: unknown.length, unresolvedDecisionCount: 0, bindingMismatchCount: 0, positionMismatchCount: 0, protectedArtifactCount: protectedPaths.length, upstreamHashesBefore: beforeHashes, upstreamHashesAfter: afterHashes, nextAction: "STOP_AFTER_BATCH_10; DO_NOT_BEGIN_BATCH_11" }, null, 2));
