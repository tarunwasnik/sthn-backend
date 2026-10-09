import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { PILOT_REVIEW_REASON_CODES, REVIEW_CATEGORIES, REVIEW_DECISIONS } from "../research/textModerationDataset/mhsReviewPilot";
import { MhsV2ExpansionCandidateArtifact } from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import {
  assertMhsV2ReviewAuthorityHashes, batchImportFilename, batchPacketFilename, batchTemplateFilename, createCompletedMhsV2ReviewDecisionCsv, createMhsV2ReviewBatchImport,
  MHS_V2_REVIEW_BATCH_01_COMPLETED_INPUT_SHA256, MHS_V2_REVIEW_BATCH_01_IMPORT_SHA256, MHS_V2_REVIEW_BATCH_01_PACKET_SHA256, MHS_V2_REVIEW_BATCH_01_TEMPLATE_SHA256,
  MHS_V2_REVIEW_BATCH_02_COMPLETED_INPUT_SHA256, MHS_V2_REVIEW_BATCH_02_IMPORT_SHA256, MHS_V2_REVIEW_BATCH_02_PACKET_SHA256, MHS_V2_REVIEW_BATCH_02_TEMPLATE_SHA256,
  MHS_V2_REVIEW_BATCH_03_COMPLETED_INPUT_SHA256, MHS_V2_REVIEW_BATCH_03_IMPORT_SHA256, MHS_V2_REVIEW_BATCH_03_PACKET_SHA256, MHS_V2_REVIEW_BATCH_03_TEMPLATE_SHA256,
  MHS_V2_REVIEW_BATCH_04_COMPLETED_INPUT_SHA256, MHS_V2_REVIEW_BATCH_04_IMPORT_SHA256, MHS_V2_REVIEW_BATCH_04_PACKET_SHA256, MHS_V2_REVIEW_BATCH_04_TEMPLATE_SHA256,
  MHS_V2_REVIEW_BATCH_05_IMPORTED_AT, MHS_V2_REVIEW_BATCH_05_MEMBERSHIP_DIGEST, MHS_V2_REVIEW_BATCH_05_PACKET_PAYLOAD_DIGEST, MHS_V2_REVIEW_BATCH_05_PACKET_SHA256, MHS_V2_REVIEW_BATCH_05_RECOVERY_RECONCILED_AT, MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256,
  MHS_V2_REVIEW_BATCH_PLAN_FILENAME, MHS_V2_REVIEW_BATCH_PLAN_SHA256, MHS_V2_REVIEW_UNIVERSE_FILENAME, MHS_V2_REVIEW_UNIVERSE_SHA256,
  MhsV2ReviewBatchImportArtifact, MhsV2ReviewBatchPacketArtifact, MhsV2ReviewBatchPlanArtifact, MhsV2ReviewerAHumanInput, MhsV2ReviewUniverseArtifact, parseCompletedMhsV2ReviewBatch, publishMhsV2CompletedReviewAndImport,
  validateBlankMhsV2ReviewDecisionTemplate, validateMhsV2ReviewBatchImport, validateMhsV2ReviewBatchPacket, validateMhsV2ReviewBatchPlan, validateMhsV2ReviewUniverse,
} from "../research/textModerationDataset/mhsV2ExpansionReviewerA";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), expansion = path.join(mhs, "expansion"), review = path.join(expansion, "review");
const batch = (number: number): string => path.join(review, `batch-${String(number).padStart(2, "0")}`), completedFilename = "mhs-v2-expansion-review-decisions-batch-05-v1-completed.csv";
const completed = (number: number): string => path.join(batch(number), `mhs-v2-expansion-review-decisions-batch-${String(number).padStart(2, "0")}-v1-completed.csv`);
const paths = {
  design: path.join(expansion, "mhs-train-expansion-design-v1.json"), proposal: path.join(expansion, "mhs-train-expansion-tranche-proposal-v1.json"), candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), acquisition: path.join(expansion, "candidates/mhs-v2-expansion-candidate-acquisition-v1.json"), policy: path.resolve(root, "dataset-research/text-moderation/policy/sthn-text-moderation-pii-policy-v1.json"), screening: path.join(expansion, "pii/mhs-v2-expansion-pii-screening-v1.json"), automaticDisposition: path.join(expansion, "pii/mhs-v2-expansion-pii-disposition-v1.json"), completedPrivacyInput: path.join(expansion, "pii/mhs-v2-expansion-human-pii-decisions-v1-completed.csv"), privacyDisposition: path.join(expansion, "pii/mhs-v2-expansion-human-pii-disposition-v1.json"), v1Candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), universe: path.join(review, MHS_V2_REVIEW_UNIVERSE_FILENAME), plan: path.join(review, MHS_V2_REVIEW_BATCH_PLAN_FILENAME),
  batch1Packet: path.join(batch(1), batchPacketFilename(1)), batch1Template: path.join(batch(1), batchTemplateFilename(1)), batch1Completed: completed(1), batch1Import: path.join(batch(1), batchImportFilename(1)),
  batch2Packet: path.join(batch(2), batchPacketFilename(2)), batch2Template: path.join(batch(2), batchTemplateFilename(2)), batch2Completed: completed(2), batch2Import: path.join(batch(2), batchImportFilename(2)),
  batch3Packet: path.join(batch(3), batchPacketFilename(3)), batch3Template: path.join(batch(3), batchTemplateFilename(3)), batch3Completed: completed(3), batch3Import: path.join(batch(3), batchImportFilename(3)),
  batch4Packet: path.join(batch(4), batchPacketFilename(4)), batch4Template: path.join(batch(4), batchTemplateFilename(4)), batch4Completed: completed(4), batch4Import: path.join(batch(4), batchImportFilename(4)),
  batch5Packet: path.join(batch(5), batchPacketFilename(5)), batch5Template: path.join(batch(5), batchTemplateFilename(5)),
};
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex"), assertHash = (filename: string, expected: string): void => { if (sha(fs.readFileSync(filename)) !== expected) throw new Error(`T6L-7I3 Batch 5 completion authority mismatch: ${path.basename(filename)}`); };
assertMhsV2ReviewAuthorityHashes(paths); assertHash(paths.universe, MHS_V2_REVIEW_UNIVERSE_SHA256); assertHash(paths.plan, MHS_V2_REVIEW_BATCH_PLAN_SHA256);
[[paths.batch1Packet, MHS_V2_REVIEW_BATCH_01_PACKET_SHA256], [paths.batch1Template, MHS_V2_REVIEW_BATCH_01_TEMPLATE_SHA256], [paths.batch1Completed, MHS_V2_REVIEW_BATCH_01_COMPLETED_INPUT_SHA256], [paths.batch1Import, MHS_V2_REVIEW_BATCH_01_IMPORT_SHA256], [paths.batch2Packet, MHS_V2_REVIEW_BATCH_02_PACKET_SHA256], [paths.batch2Template, MHS_V2_REVIEW_BATCH_02_TEMPLATE_SHA256], [paths.batch2Completed, MHS_V2_REVIEW_BATCH_02_COMPLETED_INPUT_SHA256], [paths.batch2Import, MHS_V2_REVIEW_BATCH_02_IMPORT_SHA256], [paths.batch3Packet, MHS_V2_REVIEW_BATCH_03_PACKET_SHA256], [paths.batch3Template, MHS_V2_REVIEW_BATCH_03_TEMPLATE_SHA256], [paths.batch3Completed, MHS_V2_REVIEW_BATCH_03_COMPLETED_INPUT_SHA256], [paths.batch3Import, MHS_V2_REVIEW_BATCH_03_IMPORT_SHA256], [paths.batch4Packet, MHS_V2_REVIEW_BATCH_04_PACKET_SHA256], [paths.batch4Template, MHS_V2_REVIEW_BATCH_04_TEMPLATE_SHA256], [paths.batch4Completed, MHS_V2_REVIEW_BATCH_04_COMPLETED_INPUT_SHA256], [paths.batch4Import, MHS_V2_REVIEW_BATCH_04_IMPORT_SHA256], [paths.batch5Packet, MHS_V2_REVIEW_BATCH_05_PACKET_SHA256], [paths.batch5Template, MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256]].forEach(([filename, expected]) => assertHash(filename, expected));
const protectedPaths = Object.values(paths), beforeHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
const candidate = JSON.parse(fs.readFileSync(paths.candidate, "utf8")) as MhsV2ExpansionCandidateArtifact, universe = JSON.parse(fs.readFileSync(paths.universe, "utf8")) as MhsV2ReviewUniverseArtifact, plan = JSON.parse(fs.readFileSync(paths.plan, "utf8")) as MhsV2ReviewBatchPlanArtifact, packet = JSON.parse(fs.readFileSync(paths.batch5Packet, "utf8")) as MhsV2ReviewBatchPacketArtifact, template = fs.readFileSync(paths.batch5Template, "utf8");
validateMhsV2ReviewUniverse(universe); validateMhsV2ReviewBatchPlan(plan, universe); validateMhsV2ReviewBatchPacket(packet, universe, candidate); validateBlankMhsV2ReviewDecisionTemplate(template, packet);
if (packet.batchId !== "MHS_V2_REVIEW_BATCH_05_V1" || packet.batchNumber !== 5 || packet.memberCount !== 45 || packet.rows.length !== 45 || new Set(packet.rows.map((row) => row.candidateId)).size !== 45 || packet.membershipDigest !== MHS_V2_REVIEW_BATCH_05_MEMBERSHIP_DIGEST || packet.packetPayloadDigest !== MHS_V2_REVIEW_BATCH_05_PACKET_PAYLOAD_DIGEST) throw new Error("Batch 5 frozen packet authority mismatch");
for (const number of [1, 2, 3, 4]) { validateMhsV2ReviewBatchImport(JSON.parse(fs.readFileSync(paths[`batch${number}Import` as keyof typeof paths], "utf8")) as MhsV2ReviewBatchImportArtifact); }

const r = MHS_V2_REVIEW_BATCH_05_RECOVERY_RECONCILED_AT, base = { reviewerNote: null, reviewerId: "reviewer_a_01", independenceDeclaration: "INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS", reviewedAt: r } as const;
const allow = (reasonCode: MhsV2ReviewerAHumanInput["reasonCode"]): MhsV2ReviewerAHumanInput => ({ ...base, decision: "ALLOW", primaryCategory: null, secondaryCategories: [], reasonCode });
const block = (primaryCategory: NonNullable<MhsV2ReviewerAHumanInput["primaryCategory"]>, secondaryCategories: MhsV2ReviewerAHumanInput["secondaryCategories"], reasonCode: MhsV2ReviewerAHumanInput["reasonCode"]): MhsV2ReviewerAHumanInput => ({ ...base, decision: "BLOCK", primaryCategory, secondaryCategories, reasonCode });
const judgments = new Map<string, MhsV2ReviewerAHumanInput>([
  ["src_5878b42700158908f07dd3ada11086a42fa0e9cd0de80f5bf89fb6f0a3a15eb4", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_5925d896c80b789da8342c1905af6a3dc22220ed1ae3c3d9dededdf728054279", allow("POLICY_ACCEPTABLE")],
  ["src_59473f68a11e960e681475eabc1fe4c732f089e614ed8786a076ae4bb8bddaac", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_59bedb839467a80b569cd53dab817e5db44dd0bbeb855c495de1997d377d6690", block("PROFANITY", [], "DIRECT_PROFANITY")],
  ["src_5a5318ea9ca4668d29f29dae7c1b7a31a3d2d9e47af010a21eed0f18b4d1cb86", allow("POLICY_ACCEPTABLE")],
  ["src_5aabbbf01594539fd406d11d70d1c2f96e006c96ebb0a0f3c5aa1aeb5f29081c", block("PROFANITY", ["HATE"], "DIRECT_PROFANITY")],
  ["src_5ac62f247b2f73795e85821778c472404593fc18c31e560b61dbb71aa2f1b1a8", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_5b0f58ec923f9edb9e1ace1fc56c0ab37eaeced4381211ad6d22f8258221634f", block("SEXUAL", [], "SEXUAL_CONTENT")],
  ["src_5b8890f10948b43440c25e64185271e7d2b0e63069f13863a0a22cc932b1018a", allow("POLICY_ACCEPTABLE")],
  ["src_5bda685e2f771e131a6a47d491b3fedbfdcbdbabdae833cd31eb1a6cb8ea5f71", allow("BENIGN_CONTEXT")],
  ["src_5cf1f8f06e0c2dc450c6f69914020823b2c284562a488e221d8997663885e629", block("PROFANITY", [], "DIRECT_PROFANITY")],
  ["src_5d1937bb466c449c0fffbd970760fb2f211c3a9bb0c9b1147fe857ffed9ffe3c", allow("BENIGN_CONTEXT")],
  ["src_5debe36b69cd918a19026a8e3b7d6f31511f9a000fb6e4618843c80a8d400cbc", block("PROFANITY", ["HATE"], "DIRECT_PROFANITY")],
  ["src_5efe665c59ae65724e9dc96889cabc240b915bb56dfb1d9e5c834e99ecf08caf", block("HATE", ["THREAT_OR_VIOLENCE"], "THREAT_OR_VIOLENCE")],
  ["src_5f299d593a2cddb2db9a19064b75032c3c1f4f0d567e49eb60c3774d22ac8ea5", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_6037e94178ae034425cbae7e82ffedc97472d9ab4384dff9e4e7041193d6a53d", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_60c0ff0f999fabdd6cbd54b73254b27be9ec2e0bf33539a9e0a48f00d2f40322", allow("POLICY_ACCEPTABLE")],
  ["src_61d2ca7013c8ae0630659eccfe2e4ccc2a748a487092d678d5be214a81289e27", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_626a05c27be8cbe3ec9515192ff1187b4a40377199fb06ecfeac9b4a28a419db", allow("POLICY_ACCEPTABLE")],
  ["src_6275d492793ff964e9c6fd1adde55c31e10dbf8158d909daa66d3adf186214e8", block("PROFANITY", [], "BENIGN_CONTEXT")],
  ["src_6430907af713e81ab94b0557b8e37d21c8465850acee0f3216cebb6c934aa786", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_656bedde35f7dffaac78072693239077ba764ea153713235f78c732ef98716b1", allow("BENIGN_CONTEXT")],
  ["src_661d69ff64df8ddc232260340988e2d3576a4d283f6a1cb8dad9491ff1a8dbc7", block("PROFANITY", [], "BENIGN_CONTEXT")],
  ["src_67dbedf7f1644ed65e411f2bc85c830daf3d82319ad529bf93ecb6cc660bfbde", block("SEXUAL", [], "SEXUAL_CONTENT")],
  ["src_687b1b2b76f3f2939afa873e4f03a109e6c7892f20b09ccc365d786f7ba6b2f7", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_6891b3aee88ff288e1562801191e4bfd9e0a40da1ca30b9ea4f07852817f606b", allow("POLICY_ACCEPTABLE")],
  ["src_6a005f6c68b99185cfe0bed1b42625a60d43af3cba6cbb22492bf8955a03b432", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_6b133f93510fdb51722d381e5b71beefe4dd83b61dffc79957791d09aeb0afcc", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_6c08cc87391e1f9a0c02049e3ad91fbc118bdad4fccf1b18d505f991b99d10c0", allow("BENIGN_CONTEXT")],
  ["src_6df4d6d945a690fd5c4cadc8a917856bd9337c9ec68b7cbb57d4729c5bd81971", allow("POLICY_ACCEPTABLE")],
  ["src_6f1d7e333dbb664b61b24e9213402c9012ac65747dfbeee84c8c883638141127", allow("POLICY_ACCEPTABLE")],
  ["src_6fb07d41b97563fcf24f76d9f6de69bd8367cb6326f213c020d2faefa3fb5db7", block("PROFANITY", [], "DIRECT_PROFANITY")],
  ["src_700061a8598014537bc55395b8cfeaaa07a0143ecf3256d7a20219f282036f4d", block("PROFANITY", [], "BENIGN_CONTEXT")],
  ["src_704d201ee2af7e6cdfcafb32d4c0a0deed5e54f2d45543882d992b99bb0b27d8", allow("POLICY_ACCEPTABLE")],
  ["src_7067a621af6f177d2ce85c9807e0fec23e58c9956d767e07c789b3f1c685f18f", block("PROFANITY", ["HATE"], "DIRECT_PROFANITY")],
  ["src_711645a00cd641237f58cc696d405d0f8af2ec7d9f83b970e5ddc81f33083efc", block("PROFANITY", [], "DIRECT_PROFANITY")],
  ["src_716801ccd9f91d0ab501d666c9e2625075f81bb565a1504ec2941c56b631449c", allow("BENIGN_CONTEXT")],
  ["src_728e70b53c58e9e683dad3ffd6e3e55b874755cf573578564655979dabb99a63", allow("POLICY_ACCEPTABLE")],
  ["src_72f47e407f3a8926f1e961941302b9c5724bc79102165ddf88df0ed34b6d025e", block("SEXUAL", [], "SEXUAL_CONTENT")],
  ["src_735ef1372f4f54ebc9ad52c4496cde725147cd591296c3ce960f66e79ddbe70c", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_736a49141f44972da609c3086dc6cdf4f098966fced4b8471381edfe1d7d77dc", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_7493663aed4ee081a8a57141b75d322e7b778182c96e04eadb6c31ec6fa8510e", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_7626c5aca0faf3bb4d00514cb8e21e6481bb95b8e6a0a626018d3bd6c581cb41", allow("COUNTERSPEECH_OR_REPORTING")],
  ["src_79a2a6db28c947ee8c067cb0e5d43e5c79bf12398580d6e1e9ea038af5c9a5b0", allow("BENIGN_CONTEXT")],
  ["src_79ae097a9d254a5d0ca774249ee4500fece03a656da91cc4879b33f31a461214", allow("COUNTERSPEECH_OR_REPORTING")],
]);
const newBindings: Readonly<Record<string, string>> = {
  src_5878b42700158908f07dd3ada11086a42fa0e9cd0de80f5bf89fb6f0a3a15eb4: "3226da59ecaf599fa88b2cd6c75a00126688b6a852ce21d65512735b5ef1dddf", src_5925d896c80b789da8342c1905af6a3dc22220ed1ae3c3d9dededdf728054279: "fe641277134c40794ec8ae7e9aafa1fdcb292f5def93b060fcda2d32ab2e7bb6", src_59473f68a11e960e681475eabc1fe4c732f089e614ed8786a076ae4bb8bddaac: "c14b8a271e0b99a42686edf8a2f7f4d3e24208ba9241b6e0484121fb955963d3", src_59bedb839467a80b569cd53dab817e5db44dd0bbeb855c495de1997d377d6690: "c6e784f053a7509aeceb35b909e8e826e55237631184d9ed8a21751e471bb114", src_5a5318ea9ca4668d29f29dae7c1b7a31a3d2d9e47af010a21eed0f18b4d1cb86: "c69bd8356c37a2c3390db1e874909d776655924b0ae2196bd29db494ad4f1440", src_5aabbbf01594539fd406d11d70d1c2f96e006c96ebb0a0f3c5aa1aeb5f29081c: "3aaf42fd9a437df6015aaca9251ac50be7363ebbbeb2f42c295085061867defc", src_5ac62f247b2f73795e85821778c472404593fc18c31e560b61dbb71aa2f1b1a8: "65c8320e52ed2e4ec0ba1fed911ff1ab95a995018347fa0cfa5a741912c4b019", src_5b0f58ec923f9edb9e1ace1fc56c0ab37eaeced4381211ad6d22f8258221634f: "42f5b7bddfa469827ee26f46a28667f698c9f23c1f2766c0c3fcf7efcc04ea73", src_5b8890f10948b43440c25e64185271e7d2b0e63069f13863a0a22cc932b1018a: "398b3fb5bc034ab2698a673f417c6f1c1108770623af1a2eba1509fb9dc472ec", src_5bda685e2f771e131a6a47d491b3fedbfdcbdbabdae833cd31eb1a6cb8ea5f71: "f52ba3d40003e80ac293158cb4a993d3e9273ce5ba53960097f33ec165ce2a3d", src_5cf1f8f06e0c2dc450c6f69914020823b2c284562a488e221d8997663885e629: "4733d8fbbcc98ebaf70b23add53dfb7f4f0d5837c2e4d58dd00bdaf683652d7c", src_5d1937bb466c449c0fffbd970760fb2f211c3a9bb0c9b1147fe857ffed9ffe3c: "d2229199e65f63cf945e02b97d1d340d09bd8030620c899c48b6252d9c13a8fb", src_5debe36b69cd918a19026a8e3b7d6f31511f9a000fb6e4618843c80a8d400cbc: "fc348558d9a6308a669363f043c904eb6208e3326977c037de8815353d572309", src_5efe665c59ae65724e9dc96889cabc240b915bb56dfb1d9e5c834e99ecf08caf: "86b012ae9e805036c34754d2d5bd2fd0649a3eae78b4e5715d0372bfcadabde2", src_6430907af713e81ab94b0557b8e37d21c8465850acee0f3216cebb6c934aa786: "c61f9402c282e5c233adaa2a595471a659c0cfcff35de4f463783bcd65620b6c",
};
const packetById = new Map(packet.rows.map((row) => [row.candidateId, row]));
if (Object.entries(newBindings).some(([candidateId, textSha256]) => packetById.get(candidateId)?.textSha256 !== textSha256)) throw new Error("Batch 5 newly supplied candidate ID/text SHA authority mismatch");
const nonPacket = [...judgments.keys()].filter((candidateId) => !packetById.has(candidateId)), unresolved = packet.rows.filter((row) => !judgments.has(row.candidateId));
if (judgments.size !== 45 || unresolved.length !== 0 || nonPacket.length !== 0) throw new Error(`Batch 5 reconciliation failed: resolved=${judgments.size}, unresolved=${unresolved.length}, nonPacket=${nonPacket.length}`);
const inputs = packet.rows.map((row) => judgments.get(row.candidateId) as MhsV2ReviewerAHumanInput), completedCsv = createCompletedMhsV2ReviewDecisionCsv(packet, inputs), decisions = parseCompletedMhsV2ReviewBatch(completedCsv, packet);
const count = <T extends string>(values: readonly T[], select: (row: typeof decisions[number]) => T | null): Readonly<Record<T, number>> => Object.fromEntries(values.map((value) => [value, decisions.filter((row) => select(row) === value).length])) as Record<T, number>, secondaryCounts = Object.fromEntries(REVIEW_CATEGORIES.map((category) => [category, decisions.filter((row) => row.secondaryCategories.includes(category)).length]));
if (decisions.length !== 45 || new Set(decisions.map((row) => row.candidateId)).size !== 45 || decisions.some((row, index) => row.candidateId !== packet.rows[index].candidateId || row.textSha256 !== packet.rows[index].textSha256 || row.reviewedAt !== r || row.reviewerNote !== null)) throw new Error("Batch 5 row binding, timestamp, or reviewer-note authority mismatch");
const artifact = createMhsV2ReviewBatchImport(universe, packet, completedCsv, completedFilename, MHS_V2_REVIEW_BATCH_05_TEMPLATE_SHA256, MHS_V2_REVIEW_BATCH_05_IMPORTED_AT), published = publishMhsV2CompletedReviewAndImport(completedCsv, completedFilename, artifact, batch(5)), afterHashes = Object.fromEntries(protectedPaths.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha(fs.readFileSync(filename))]));
if (canonicalJson(beforeHashes) !== canonicalJson(afterHashes)) throw new Error("Protected authority changed during Batch 5 completion");
console.log(JSON.stringify({ ...published, payloadIntegrityDigest: artifact.payloadIntegrityDigest, batchId: artifact.batchId, rowCount: artifact.rowCount, uniqueCandidateCount: new Set(decisions.map((row) => row.candidateId)).size, membershipDigest: artifact.membershipDigest, decisionCounts: count(REVIEW_DECISIONS, (row) => row.decision), primaryCategoryCounts: count(REVIEW_CATEGORIES, (row) => row.primaryCategory), secondaryCategoryCounts: secondaryCounts, reasonCodeCounts: count(PILOT_REVIEW_REASON_CODES, (row) => row.reasonCode), recoveryReconciledAt: r, recoveryCandidateCount: 45, reviewerId: artifact.reviewerId, duplicateBindings: 0, conflictingBindings: 0, nonPacketBindings: nonPacket.length, unresolvedCandidates: unresolved.length, upstreamHashesBefore: beforeHashes, upstreamHashesAfter: afterHashes, nextAction: "STOP_AFTER_BATCH_5; BATCH_6_REQUIRES_SEPARATE_AUTHORIZATION" }, null, 2));
