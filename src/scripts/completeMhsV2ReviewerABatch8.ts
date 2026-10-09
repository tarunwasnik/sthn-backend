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
const completedFilename = "mhs-v2-expansion-review-decisions-batch-08-v1-completed.csv";
const completed = (number: number): string => path.join(batch(number), `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1-completed.csv`);
const paths: Record<string, string> = {
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"), proposal: path.join(expansion, "mhs-train-expansion-tranche-proposal-v1.json"), candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"), screening: path.join(expansion, "pii/mhs-v2-expansion-pii-screening-v1.json"), automaticDisposition: path.join(expansion, "pii/mhs-v2-expansion-pii-disposition-v1.json"), completedPrivacyInput: path.join(expansion, "pii/mhs-v2-expansion-human-pii-decisions-v1-completed.csv"), privacyDisposition: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"), v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), universe: path.join(review, reviewAuthority.MHS_V2_REVIEW_UNIVERSE_FILENAME), plan: path.join(review, reviewAuthority.MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].flatMap((number) => [[`batch${number}Packet`, path.join(batch(number), reviewAuthority.batchPacketFilename(number))], [`batch${number}Template`, path.join(batch(number), reviewAuthority.batchTemplateFilename(number))], [`batch${number}Completed`, completed(number)], [`batch${number}Import`, path.join(batch(number), reviewAuthority.batchImportFilename(number))]])),
  batch8Packet: path.join(batch(8), reviewAuthority.batchPacketFilename(8)), batch8Template: path.join(batch(8), reviewAuthority.batchTemplateFilename(8)),
};
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const assertHash = (filename: string, expected: string): void => { if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 Batch 8 completion authority mismatch: ${path.basename(filename)}`); };
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
];
predecessorHashes.forEach((hashes, index) => ["Packet", "Template", "Completed", "Import"].forEach((suffix, item) => assertHash(paths[`batch${index + 1}${suffix}`], hashes[item])));
assertHash(paths.batch8Packet, reviewAuthority.MHS_V2_REVIEW_BATCH_08_PACKET_SHA256);
assertHash(paths.batch8Template, reviewAuthority.MHS_V2_REVIEW_BATCH_08_TEMPLATE_SHA256);
const protectedPaths = Object.values(paths);
const beforeHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact;
const universe = JSON.parse(fs.readFileSync(paths.universe, "utf8")) as reviewAuthority.MhsV2ReviewUniverseArtifact;
const plan = JSON.parse(fs.readFileSync(paths.plan, "utf8")) as reviewAuthority.MhsV2ReviewBatchPlanArtifact;
const packet = JSON.parse(fs.readFileSync(paths.batch8Packet, "utf8")) as reviewAuthority.MhsV2ReviewBatchPacketArtifact;
const template = fs.readFileSync(paths.batch8Template, "utf8");
reviewAuthority.validateMhsV2ReviewUniverse(universe);
reviewAuthority.validateMhsV2ReviewBatchPlan(plan, universe);
reviewAuthority.validateMhsV2ReviewBatchPacket(packet, universe, candidate);
reviewAuthority.validateBlankMhsV2ReviewDecisionTemplate(template, packet);
if (packet.batchId !== "MHS_V2_REVIEW_BATCH_08_V1" || packet.batchNumber !== 8 || packet.memberCount !== 45 || packet.rows.length !== 45 || new Set(packet.rows.map((row) => row.candidateId)).size !== 45 || new Set(packet.rows.map((row) => row.textSha256)).size !== 45 || packet.membershipDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_08_MEMBERSHIP_DIGEST || packet.packetPayloadDigest !== reviewAuthority.MHS_V2_REVIEW_BATCH_08_PACKET_PAYLOAD_DIGEST) throw new Error("Batch 8 frozen packet authority mismatch");
for (const number of [1, 2, 3, 4, 5, 6, 7]) reviewAuthority.validateMhsV2ReviewBatchImport(JSON.parse(fs.readFileSync(paths[`batch${number}Import`], "utf8")) as reviewAuthority.MhsV2ReviewBatchImportArtifact);

const reviewedAt = reviewAuthority.MHS_V2_REVIEW_BATCH_08_AUTHORITY_RECONCILED_AT;
const base = { reviewerNote: null, reviewerId: "reviewer_a_01", independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS", reviewedAt } as const;
const allow = (reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "ALLOW", primaryCategory: null, secondaryCategories: [], reasonCode });
const block = (primaryCategory: NonNullable<reviewAuthority.MhsV2ReviewerAHumanInput["primaryCategory"]>, secondaryCategories: reviewAuthority.MhsV2ReviewerAHumanInput["secondaryCategories"], reasonCode: reviewAuthority.MhsV2ReviewerAHumanInput["reasonCode"]): reviewAuthority.MhsV2ReviewerAHumanInput => ({ ...base, decision: "BLOCK", primaryCategory, secondaryCategories, reasonCode });
const supplied = new Map<string, { readonly textSha256: string; readonly input: reviewAuthority.MhsV2ReviewerAHumanInput }>([
  ["src_b0cd69067d8354b3c4e8d9ad722ff1da373303c7310565d092a8b397bed3bdc8", { textSha256: "dce3958271d738f9de6415ddd5e72b97c9d72644d80d33623358b12732c34cc2", input: allow("POLICY_ACCEPTABLE") }],
  ["src_b389e987446dc93fa64f5888befc91dc39c9645bef3ee3e7586809b2e283b1c1", { textSha256: "faa98a47e0071acf943307146963a712b6ec5c125ba544bf5705056a76672efe", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_b71d879ec8e0eb3c4328c7834a814a797413c3482c8c79d9378bca2f71d09b2a", { textSha256: "010962960dcfb4363e00dfb5909d88e103cff957cd39db736cd739b47d524713", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "DIRECT_PROFANITY") }],
  ["src_b8651ae4319d3c8e66779e5c04d53105f01bac614f97129a53c4cf8d0a778bf8", { textSha256: "6ceb0eb7ab9c8a8bdde9135d6f19bd9a181e6dcb13470087f76a736938bdebdf", input: block("SEXUAL", ["ABUSIVE_OR_HARASSING"], "SEXUAL_CONTENT") }],
  ["src_bb4ea7fbb3bb4d08e152a403be1dc79e8f444e0534157a498d9f157f110d65f3", { textSha256: "5b41cec570a87b2c1893bce2e11104a63e1492dbdaa943373f8672e852cf69a5", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_bb60797eea71c7109da24f52f30d58a06cb1c5c266c83ac966a4718392f708c1", { textSha256: "c9e969a100a3a4cb7aba27388c0b4e90d8fc3fe027c338238f8b310eda13c127", input: block("THREAT_OR_VIOLENCE", [], "THREAT_OR_VIOLENCE") }],
  ["src_bb9e69109744858e03f4fb0b65867fd964065aff3580efdfce6aae0a1179ec13", { textSha256: "eab713548af152355da62050d95f653225d9dfe863dc9e69238e62220ba15a1f", input: block("PROFANITY", ["HATE"], "DIRECT_PROFANITY") }],
  ["src_bba2fe40326657001c59b1482efe6e169375809322da112c30666ed3e444f0ec", { textSha256: "64bde0eccadbe84006082dfcc00476d0f2ca12363863c37d50047f8e5a22115d", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_bbe610d67bae8300c5e0dc0bbe71ebc2e182e33157a8bdaafe686b7f6a19cffc", { textSha256: "4964349f293f3ae2b5f34da8cbe05389f908b7807ee977aefd47dbcbc57bc8e5", input: block("ABUSIVE_OR_HARASSING", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_bc171a9e7ffb9564ab07ea24f3b8f761bf652343eea2905bb81073f1d36f8110", { textSha256: "e2af7f7ce80323784dbf5c35fc1582f0c446043f48cda6d4dd65ef9d983a1dc3", input: allow("BENIGN_CONTEXT") }],
  ["src_bd3687bb6935866823f511ad1cffc74acb2a4390f27d5668c1fc4532bc991e16", { textSha256: "49273502b39b512d090414eed530be33a88f0287f9cb646fcf730ff25df037d7", input: allow("POLICY_ACCEPTABLE") }],
  ["src_bd5e311ad9bdd4696e1a7d9c8c07e585e3193a7e78b4e009ec4d6ff43fbfc194", { textSha256: "c2e1f518d2401ddff9e9263eeaa8200937e6f5a342025bbd5c0edf2d9de6a798", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_be545bb80293c49cb49a332f10032b3c16631ce30fd3aef1863bfbfaf79143c3", { textSha256: "958238a5514bbd742c7747a240e82e23742929f60df9556ce649999ffff3f729", input: allow("POLICY_ACCEPTABLE") }],
  ["src_bf119b7fa26644f31108ecdc470020dd85f21c6b611707f9c4541d9cd379b75d", { textSha256: "43d8366640395d126942de7d40ab7f303bbd3bac79815cb717b27663914b69a9", input: allow("POLICY_ACCEPTABLE") }],
  ["src_bfc856fdaaecf53fccf2507fabece630758c40314269ac4c22a474d3cb88f028", { textSha256: "9e6d100b0602a46f0d7241d74c0c74c78e88e7c961317fe2fb06318517cf7c7d", input: block("PROFANITY", ["HATE"], "DIRECT_PROFANITY") }],
  ["src_bfcd620154861ae6a7dab4cc11e6fd5fb1c90a480b0db8ec62c9b26aa694b6fb", { textSha256: "4d34e327d1f883ec865d1cca40ee131aaca52dbedfb38b291ca3c20ced4c3be7", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_bfdc3cdfa85b621909bccc0efeda743a762ed7612fd2af3ab506e2eaa0bc5d4f", { textSha256: "ad58b619580b1a3db5377d7db742e43c0183f95c6a4b6ef417b3b791b0d9d9fc", input: allow("POLICY_ACCEPTABLE") }],
  ["src_c02b95ca929653fb0430ae3e822388d6b7a292db50c4c473ef202c2d0a6bd14b", { textSha256: "52abc676795272b97cead989d125570501c1b2f8e84359689700d603b897043b", input: allow("BENIGN_CONTEXT") }],
  ["src_c085a246b0b10d961f9c7b2b900cbe3a278e0992a0e9e0b26376d77e342a9206", { textSha256: "b29864cc4fd56e8fe36497f0f1d86152e8844327a60047237fe0330d303e195d", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_c0d464981df48cfdf22d15647f6c76ac1fdce1896eb1c37a233811c3e5454470", { textSha256: "6d00e9f4295c6161ebebd28be064e6af4ae52279637caaf1133d11b91084b2db", input: allow("POLICY_ACCEPTABLE") }],
  ["src_c109c8e203dcb1e2f6d19ad2fe6a869b512b94bb7935569eab37f7b4fae0e26f", { textSha256: "da310ebea8690555634f5d10f850300b5e628f29652e39617e2250ee48a64fa6", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_c16169e86f6a1959624845a908f2013e4a36e1dda43854d3e6ac4b08b0448179", { textSha256: "ba740798c7dada3ea6fb98b1d26bead1715e28070a2867cd849ee503256e894e", input: allow("POLICY_ACCEPTABLE") }],
  ["src_c259067e037e3576bf663c081a760e854a6b2ec929f3b301eb9b1816630ff2bb", { textSha256: "458069fc7bc1374d4d67c53d60b3c0aaa447db9977babdfcfa1f1202731608b1", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_c32f2c37f3dc760eac19c41b9b3eb55cd52107539c563104b2852636372a1774", { textSha256: "24c10ef9c8e6c01be98ea4a3ba2fcadb74f59dbf7452b0f2c4d2e20f80a6565f", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_c33d39ca0853f9850d395ac6a23f76f76910d61756a952fc881a200f8f528bd4", { textSha256: "e81cedd714d971052ef4faeb8a892f0f7251c30158cd6255683323cc6c7bceea", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_c3592207de95e10c7c3d65d15396040d813a1b8067916d84558ab8104ece7469", { textSha256: "c2a7c1cf2924d3ede4bc9f8cc1ab8cf4863886c4b46108d742d67dcafc20906b", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_c3dd64e0ed783e3d170f862661bd610e085d7642e03f92cd507c83c106a6ffde", { textSha256: "8ddecbc976e8be97d15529d3aa4ada4c4fc40b6a70730e0593df89f25b2c8ffb", input: block("THREAT_OR_VIOLENCE", [], "THREAT_OR_VIOLENCE") }],
  ["src_c56e54398d4640b55aa38d9292df6d845b49812c21c6c8bd7a5d213fde00f2e3", { textSha256: "79a1401d21b71de1c3d5a3fa2ca86d4311023f9fd9433be3c1ced10932663468", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_c5f54ade2edc30a6567c108c03e5afaeb77247a81a93c57a52924594a1ef7c3b", { textSha256: "38c7cdbc226e9fc51f51ab412cf7d86bc345bf7437231b30c1007666bce88a2a", input: block("THREAT_OR_VIOLENCE", ["HATE"], "THREAT_OR_VIOLENCE") }],
  ["src_c6db48a5576544418d2b2b07a6a74591b775bc438e1f2550e05310ed53ed3d5c", { textSha256: "490a5ed85d8c5194c038e8316cfd60e4da4ad1ab7190e0e3bf75abf10afa7dd0", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_c7972ec9ac4c2a2bd0fe2c180bfb1ec8f63984cd288a5a09305e94945d8ebe88", { textSha256: "a2932f18bdbda99490b3a5073cda041e41a411fb330932216be3d5c8590d31b7", input: allow("POLICY_ACCEPTABLE") }],
  ["src_c81b1b1059f12fec49f00169267a7f7674a0ef5192b73a6edec329361c8bf198", { textSha256: "48d92578a42fc28df10805402ab892df893cb72454e5e342ebf11b7e2ed1d8b4", input: block("THREAT_OR_VIOLENCE", ["PROFANITY"], "THREAT_OR_VIOLENCE") }],
  ["src_c8f48383794b260d29703b1bb388d57aee9c7aac4184f13307417b5ed86c32ce", { textSha256: "e9434efb0f1963397c2b026a35144d1f8d5ba34e432b7ed8f091efa6c166f0dd", input: allow("BENIGN_CONTEXT") }],
  ["src_c8f6a07cad68efd0176501752e6e169b38e013ffb075267439eb9c1256ce6476", { textSha256: "d3e37908635cbbd24df66cbfc2dccb6df2a59763c469915a0a9d0ff79700352c", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "TARGETED_ABUSE") }],
  ["src_c961f64f1bdefd13f89df46229ce483b0d374d68f1dd8e57adcf544437bda467", { textSha256: "6a85221f9ef4f125d35a7225fe7a76ee82631b1343b39a2555ed1b526f1d8c72", input: allow("BENIGN_CONTEXT") }],
  ["src_c99882e9225e37119810168dc484aceec2cb8decfad8e288cbbccd7274e72323", { textSha256: "50261831fb3c7f1821ba1cd9ada52e22836b5c68a38104f4c5a34c7bbeff08a6", input: allow("POLICY_ACCEPTABLE") }],
  ["src_ca441839e5d2073ef3bc7768e9d52a0bcc2399a77da89c6f7e7ed8c485e57e6d", { textSha256: "8d8f1e929bb167362bcd0b79c2e34f599dd34c84e4604ab2871eb683c2f12abb", input: block("SEXUAL", ["PROFANITY"], "SEXUAL_CONTENT") }],
  ["src_cc6feda7a0f7decf6d394a3c64cd508b8769ece5bd282ece0a43ee843f55eb7a", { textSha256: "1787fd6564ca525ea3ac6739d80847d9725ce6a7a938c6117c9c9a8fbc07962e", input: block("SEXUAL", [], "SEXUAL_CONTENT") }],
  ["src_ccc87cbcdf467d68a1dc0b26d99293ec63c210c0e74c7d55db0fcd90300dba54", { textSha256: "831ba80c71af57f769a0b7ad11e4dcdef40aca21ad772600769998af090cf291", input: allow("BENIGN_CONTEXT") }],
  ["src_cf34fde2ae70ba2db7e6be227897dd388a14f69cb2bfbd2e231c932773296f00", { textSha256: "6058ce162b0c2b9d0de5bcf4d49034e1c6e2a5d2cab683244929cf5594c2e448", input: block("PROFANITY", [], "DIRECT_PROFANITY") }],
  ["src_d06536e8d88c250394a686111e66b3815285fb434c2718db1267d9f7dbd1242b", { textSha256: "a43d383aa4d5e6f784101d4ea67eec92b2bcd60962bf86b1aca0d3f5da9f173c", input: block("PROFANITY", ["ABUSIVE_OR_HARASSING"], "DIRECT_PROFANITY") }],
  ["src_d1d871a3d913b086a843a556f590cd897721da9a5b70bc873224bbc5f4f45a77", { textSha256: "bd176701d0bf1c15b787d297e8491b2f44917de71ba7366e49dc4ec5f8764271", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_d22cfef79af0c5af16bcfd68c053699ceb38dda04ab7bd125f943cd9f7b66403", { textSha256: "19ec5dc0fa0041d4ac652ea24e14da9ad023208cb1d98800b1d789ee4c034b6d", input: allow("BENIGN_CONTEXT") }],
  ["src_d261e572bb1e618e265144fee5e9bebde556d602ce4875cbf073400d72c3e796", { textSha256: "b1c8a3b38283e3663d21f3ed46e3ce4da87702355c3c9f567a7eb7808d035809", input: allow("COUNTERSPEECH_OR_REPORTING") }],
  ["src_d2b7ae680107acd0178b1b1a00570a7a5c03519f1ac0562cf251035dd4a8d824", { textSha256: "9d71e89a6e21980b24e77a5570abe9da69fd1e6f98bd386eacd0e08b761265ee", input: allow("COUNTERSPEECH_OR_REPORTING") }],
]);
const packetIds = new Set(packet.rows.map((row) => row.candidateId));
const unknown = [...supplied.keys()].filter((candidateId) => !packetIds.has(candidateId));
const missing = packet.rows.filter((row) => !supplied.has(row.candidateId));
const decisions = packet.rows.map((row) => { const suppliedRow = supplied.get(row.candidateId); if (!suppliedRow || suppliedRow.textSha256 !== row.textSha256) throw new Error(`Batch 8 Reviewer A binding mismatch: ${row.candidateId}`); return { candidateId: row.candidateId, textSha256: row.textSha256, ...suppliedRow.input }; });
if (supplied.size !== 45 || decisions.length !== 45 || unknown.length !== 0 || missing.length !== 0 || new Set(decisions.map((row) => row.candidateId)).size !== 45 || new Set(decisions.map((row) => row.textSha256)).size !== 45 || decisions.some((row) => !Number.isFinite(Date.parse(row.reviewedAt)))) throw new Error("Batch 8 Reviewer A membership or metadata reconciliation failed");
const count = (values: readonly string[], allowed: readonly string[]): Record<string, number> => Object.fromEntries(allowed.map((value) => [value, values.filter((item) => item === value).length]));
const decisionCounts = count(decisions.map((row) => row.decision), REVIEW_DECISIONS);
const primaryCategoryCounts = count(decisions.flatMap((row) => row.primaryCategory === null ? [] : [row.primaryCategory]), REVIEW_CATEGORIES);
const secondaryCategoryCounts = { NONE: decisions.filter((row) => row.decision === "BLOCK" && row.secondaryCategories.length === 0).length, ...count(decisions.flatMap((row) => row.secondaryCategories), REVIEW_CATEGORIES) };
const reasonCodeCounts = count(decisions.map((row) => row.reasonCode), PILOT_REVIEW_REASON_CODES);
if (canonicalJson(decisionCounts) !== canonicalJson({ ALLOW: 22, BLOCK: 23, NEEDS_ADJUDICATION: 0, EXCLUDE: 0 }) || canonicalJson(primaryCategoryCounts) !== canonicalJson({ PROFANITY: 12, SEXUAL: 5, ABUSIVE_OR_HARASSING: 1, HATE: 0, THREAT_OR_VIOLENCE: 5, OTHER_INAPPROPRIATE: 0 }) || canonicalJson(secondaryCategoryCounts) !== canonicalJson({ NONE: 12, PROFANITY: 2, SEXUAL: 0, ABUSIVE_OR_HARASSING: 4, HATE: 5, THREAT_OR_VIOLENCE: 0, OTHER_INAPPROPRIATE: 0 }) || canonicalJson(reasonCodeCounts) !== canonicalJson({ POLICY_ACCEPTABLE: 9, DIRECT_PROFANITY: 11, SEXUAL_CONTENT: 5, TARGETED_ABUSE: 1, PROTECTED_GROUP_HATE: 0, THREAT_OR_VIOLENCE: 6, COUNTERSPEECH_OR_REPORTING: 7, BENIGN_CONTEXT: 6, INSUFFICIENT_CONTEXT: 0, PII_OR_DATA_QUALITY: 0, OTHER_POLICY_MISMATCH: 0, OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION: 0 })) throw new Error("Batch 8 corrected aggregate authority mismatch");
const completedInputs: readonly reviewAuthority.MhsV2ReviewerAHumanInput[] = decisions.map((row) => ({ decision: row.decision, primaryCategory: row.primaryCategory, secondaryCategories: row.secondaryCategories, reasonCode: row.reasonCode, reviewerNote: row.reviewerNote, reviewerId: row.reviewerId, independenceDeclaration: row.independenceDeclaration, reviewedAt: row.reviewedAt }));
const completedCsv = reviewAuthority.createCompletedMhsV2ReviewDecisionCsv(packet, completedInputs);
const parsed = reviewAuthority.parseCompletedMhsV2ReviewBatch(completedCsv, packet);
if (canonicalJson(parsed) !== canonicalJson(decisions)) throw new Error("Batch 8 completed CSV did not preserve Reviewer A authority");
const artifact = reviewAuthority.createMhsV2ReviewBatchImport(universe, packet, completedCsv, completedFilename, reviewAuthority.MHS_V2_REVIEW_BATCH_08_TEMPLATE_SHA256, reviewAuthority.MHS_V2_REVIEW_BATCH_08_IMPORTED_AT);
const published = reviewAuthority.publishMhsV2CompletedReviewAndImport(completedCsv, completedFilename, artifact, batch(8));
const afterHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
if (canonicalJson(beforeHashes) !== canonicalJson(afterHashes)) throw new Error("Protected authority changed during Batch 8 completion");
console.log(JSON.stringify({ ...published, payloadIntegrityDigest: artifact.payloadIntegrityDigest, batchId: artifact.batchId, rowCount: artifact.rowCount, uniqueCandidateCount: new Set(decisions.map((row) => row.candidateId)).size, uniqueTextShaCount: new Set(decisions.map((row) => row.textSha256)).size, membershipDigest: artifact.membershipDigest, decisionCounts, primaryCategoryCounts, secondaryCategoryCounts, reasonCodeCounts, reviewerId: artifact.reviewerId, reviewedAt, missingCount: missing.length, duplicateCount: 0, unknownCount: unknown.length, unresolvedDecisionCount: 0, bindingMismatchCount: 0, upstreamHashesBefore: beforeHashes, upstreamHashesAfter: afterHashes, nextAction: "STOP_AFTER_BATCH_8; DO_NOT_BEGIN_BATCH_9" }, null, 2));
