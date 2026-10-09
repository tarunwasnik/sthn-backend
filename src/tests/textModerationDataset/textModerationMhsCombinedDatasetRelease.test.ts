import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_COMBINED_DATASET_VERSION, MHS_COMBINED_ELIGIBILITY_FILENAME, MHS_COMBINED_RELEASE_FILENAME, MHS_COMBINED_RELEASE_VERSION,
  MhsCombinedReleaseInputs, authorizeMhsCombinedReleasedCandidateAccess, createMhsCombinedDatasetRelease,
  publishMhsCombinedDatasetRelease, validateMhsCombinedDatasetRelease, validateMhsCombinedEligibility,
} from "../../research/textModerationDataset/mhsCombinedDatasetRelease";
import {
  MHS_DATASET_VERSION, MHS_RELEASE_VERSION, MhsReleaseManifestArtifact, MhsTrainingEligibilityManifestArtifact,
  authorizeMhsReleasedCandidateAccess, validateMhsReleaseManifestArtifact, validateMhsTrainingEligibilityManifestArtifact,
} from "../../research/textModerationDataset/mhsDatasetRelease";
import { MhsSplitManifestArtifact } from "../../research/textModerationDataset/mhsSplitManifest";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), expansion = path.join(mhs, "expansion"), semantic = path.join(expansion, "semantic-calibration"), releasePlanning = path.join(expansion, "release-planning"), finalAssignment = path.join(expansion, "final-assignment");
const paths = {
  oldRelease: path.join(mhs, "release/mhs-release-manifest-v1.json"), oldEligibility: path.join(mhs, "release/mhs-training-eligibility-manifest-v1.json"), oldEligibilityPlan: path.join(mhs, "release/mhs-training-eligibility-release-plan-v1.json"), historicalSplit: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"),
  candidate: path.join(expansion, "candidates/mhs-v2-expansion-candidates-v1.json"), universe: path.join(expansion, "review/mhs-v2-expansion-review-universe-v1.json"), consolidation: path.join(expansion, "certification/mhs-v2-expansion-consolidation-certification-v1.json"), leakagePolicy: path.join(semantic, "mhs-v2-semantic-leakage-control-policy-v1.json"), graph: path.join(semantic, "mhs-v2-semantic-leakage-graph-v1.json"), components: path.join(semantic, "mhs-v2-semantic-leakage-components-v1.json"), cqCertification: path.join(semantic, "mhs-v2-historical-split-anchor-collision-certification-v1.json"), protectedCertification: path.join(expansion, "protected-contamination/mhs-v2-protected-contamination-certification-v1.json"),
  releasePolicy: path.join(releasePlanning, "mhs-v2-train-expansion-release-policy-v1.json"), releaseFeasibility: path.join(releasePlanning, "mhs-v2-train-expansion-release-feasibility-v1.json"), releasePlan: path.join(releasePlanning, "mhs-v2-train-expansion-release-plan-v1.json"), releaseProjection: path.join(releasePlanning, "mhs-v2-train-expansion-candidate-release-projection-v1.json"), componentAssignment: path.join(finalAssignment, "mhs-v2-final-leakage-safe-component-assignment-v1.json"), candidateAssignment: path.join(finalAssignment, "mhs-v2-final-leakage-safe-candidate-assignment-projection-v1.json"), assignmentAnalysis: path.join(finalAssignment, "mhs-v2-final-leakage-safe-assignment-analysis-v1.json"), assignmentCertification: path.join(finalAssignment, "mhs-v2-final-leakage-safe-assignment-certification-v1.json"),
};
const bytes = (): MhsCombinedReleaseInputs => Object.fromEntries(Object.entries(paths).map(([name, filename]) => [`${name}Bytes`, fs.readFileSync(filename)])) as unknown as MhsCombinedReleaseInputs;
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const temp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-8a0-"));
const oldRelease = (): MhsReleaseManifestArtifact => JSON.parse(fs.readFileSync(paths.oldRelease, "utf8")) as MhsReleaseManifestArtifact;
const oldEligibility = (): MhsTrainingEligibilityManifestArtifact => JSON.parse(fs.readFileSync(paths.oldEligibility, "utf8")) as MhsTrainingEligibilityManifestArtifact;
const historicalSplit = (): MhsSplitManifestArtifact => JSON.parse(fs.readFileSync(paths.historicalSplit, "utf8")) as MhsSplitManifestArtifact;

test("T6L-8A0 combined release and external eligibility authorization", async (t) => {
  const before = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha(filename)]));
  const first = createMhsCombinedDatasetRelease(bytes()), second = createMhsCombinedDatasetRelease(bytes());
  const { release, eligibility } = first;
  const train = eligibility.entries.filter((row) => row.split === "TRAIN"), validation = eligibility.entries.filter((row) => row.split === "VALIDATION"), historical = eligibility.entries.filter((row) => row.origin === "HISTORICAL_MHS_V1"), v2 = eligibility.entries.filter((row) => row.origin === "MHS_V2_EXPANSION");
  const trainEntry = train[0], validationEntry = validation[0];
  const access = (candidateId: string, candidateTextDigest: string, purpose: "TRAINING" | "VALIDATION", releaseVersion = MHS_COMBINED_RELEASE_VERSION as string, datasetVersion = MHS_COMBINED_DATASET_VERSION as string, r = release, e = eligibility) => authorizeMhsCombinedReleasedCandidateAccess({ candidateId, candidateTextDigest, purpose, releaseVersion, datasetVersion }, r, e);
  const check = async (number: number, label: string, fn: () => void): Promise<void> => t.test(`${String(number).padStart(2, "0")} ${label}`, fn).then(() => undefined);
  await check(1, "old V1 release validates unchanged", () => validateMhsReleaseManifestArtifact(oldRelease(), oldEligibility()));
  await check(2, "old V1 eligibility validates unchanged", () => validateMhsTrainingEligibilityManifestArtifact(oldEligibility()));
  await check(3, "old V1 release SHA exact", () => assert.equal(sha(paths.oldRelease), "d318d6ec929477beb77f624b47bd09280498a0d0e20426c89dfd1c0620034d96"));
  await check(4, "old V1 eligibility SHA exact", () => assert.equal(sha(paths.oldEligibility), "2a7b930123607fdf14dd18be6c03f2976ab3d7e23977158e2a9a255214b97322"));
  await check(5, "old plan SHA exact", () => assert.equal(sha(paths.oldEligibilityPlan), "7e8dfe0da98201e2a80e5c4d01b35a3d21ff48096d46420a33b248aea9b3fb19"));
  await check(6, "old plan payload exact", () => assert.equal(JSON.parse(fs.readFileSync(paths.oldEligibilityPlan, "utf8")).planningPayloadDigest, "92c901ecf93c9f45a956ab94e2502b2a353b49c0f7dfc0f613820658c67cb985"));
  await check(7, "historical split authority exact", () => assert.equal(sha(paths.historicalSplit), "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f"));
  await check(8, "INTERNAL_TEST freeze authority exact", () => assert.equal(sha(paths.internalTestFreeze), "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36"));
  await check(9, "candidate authority exact", () => assert.equal(sha(paths.candidate), "972dd6b681fe953e10cc66eeb5dd15091bed86b60df19171a46cf31d45a463d0"));
  await check(10, "universe authority exact", () => assert.equal(sha(paths.universe), "ca7e922cac23416e9da64c9a0ceefa52d40df7246f286f940bd1c13fd135095a"));
  await check(11, "consolidation authority exact", () => assert.equal(sha(paths.consolidation), "698cf1005601c35b6f3bd1504f43971e3e242c4b3d5d2e92b13269db2b7ecbc9"));
  await check(12, "leakage policy authority exact", () => assert.equal(sha(paths.leakagePolicy), "e7723e8576d3f1f2786b2328b71a5a34930ddbcaf250507fdc227240175399a3"));
  await check(13, "graph authority exact", () => assert.equal(sha(paths.graph), "07da805e7e928cfd37be6a661e3e43bb581719d88d59d4962a4b9fbe5142d2f6"));
  await check(14, "components authority exact", () => assert.equal(sha(paths.components), "32c25a5acacc3327596df8339f641afa80ee230616e8b384c6a5c9fb86cfcdab"));
  await check(15, "CQ authority exact", () => assert.equal(sha(paths.cqCertification), "1f6e9a7095302a7384f1550a592f6b163a590a3f1adb90f917f5602f194ce209"));
  await check(16, "protected authority exact", () => assert.equal(sha(paths.protectedCertification), "f86cd1cdf44d59d0de71dda748c6bc568904ec691481860c219e5e988c8c00dd"));
  await check(17, "7I5 four authorities exact", () => assert.deepEqual([sha(paths.releasePolicy), sha(paths.releaseFeasibility), sha(paths.releasePlan), sha(paths.releaseProjection)], ["86e2b3433780d8a683937c4163a919f4c3ab9f1eda8689655bda4d42dd5633df", "ea964eacea21c24939a56f5b5974024fb99ab0a0ec619bf01944ceb1ff4e140e", "0a8d11b68f3e29f06c16e584e30a458b8848d50b53a78637167c2241e74447ad", "0c9e662f917d4a98e7108d6b30756168de7c5f05dffe4dd2149d0ac1bf3e5407"]));
  await check(18, "7K-D four authorities exact", () => assert.deepEqual([sha(paths.componentAssignment), sha(paths.candidateAssignment), sha(paths.assignmentAnalysis), sha(paths.assignmentCertification)], ["edaa762d3a04f0118ef4d4534037e01a0ca60b11e2c2ccca676bfd884077a9f9", "c76f9e1af7a4a8fb9644ca33e92e2f2f271b77625e2f1df46b182a8608bb6a46", "7e680568088e775ef853f387310a8f58268246a5b97666f6e88bec3a72af4f4a", "1a574fdbd1b832728dc9ac879c8d914775a10304f31d47b622fcb89c78d8ad32"]));
  await check(19, "new eligibility validates", () => validateMhsCombinedEligibility(eligibility));
  await check(20, "new paired release validates", () => validateMhsCombinedDatasetRelease(release, eligibility));
  await check(21, "new identities are explicit", () => assert.deepEqual([release.datasetVersion, release.releaseVersion], ["STHN_TEXT_MODERATION_DATASET_MHS_V2", "MHS_DATASET_RELEASE_V2"]));
  await check(22, "combined TRAIN is 200", () => assert.equal(train.length, 200));
  await check(23, "historical TRAIN is 60", () => assert.equal(train.filter((row) => row.origin === "HISTORICAL_MHS_V1").length, 60));
  await check(24, "V2 TRAIN is 140", () => assert.equal(train.filter((row) => row.origin === "MHS_V2_EXPANSION").length, 140));
  await check(25, "TRAIN label distribution exact", () => assert.deepEqual(release.releaseContent.TRAIN.decisionDistribution, { ALLOW: 110, BLOCK: 90 }));
  await check(26, "TRAIN BLOCK category distribution exact", () => assert.deepEqual(release.releaseContent.TRAIN.blockCategoryDistribution, { ABUSIVE_OR_HARASSING: 18, HATE: 16, PROFANITY: 23, SEXUAL: 18, THREAT_OR_VIOLENCE: 15 }));
  await check(27, "VALIDATION is 13", () => assert.equal(validation.length, 13));
  await check(28, "VALIDATION labels exact", () => assert.deepEqual(release.releaseContent.VALIDATION.decisionDistribution, { ALLOW: 9, BLOCK: 4 }));
  await check(29, "V2 VALIDATION is zero", () => assert.equal(validation.filter((row) => row.origin === "MHS_V2_EXPANSION").length, 0));
  await check(30, "V2 INTERNAL_TEST is zero", () => assert.equal(release.releaseContent.INTERNAL_TEST.candidateCount, 13));
  await check(31, "TRAINING_ELIGIBLE is 200", () => assert.equal(train.filter((row) => row.eligibility === "TRAINING_ELIGIBLE").length, 200));
  await check(32, "VALIDATION_AUTHORIZED is 13", () => assert.equal(validation.filter((row) => row.eligibility === "VALIDATION_AUTHORIZED").length, 13));
  await check(33, "no duplicate eligibility", () => assert.equal(new Set(eligibility.entries.map((row) => row.candidateId)).size, 213));
  await check(34, "historical identities exactly preserved", () => assert.deepEqual(historical.map((row) => [row.candidateId, row.candidateTextDigest, row.split]), oldEligibility().entries.map((row) => [row.candidateId, row.candidateTextDigest, row.split]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  await check(35, "all V2 rows exactly equal K-D released identities", () => { const kd = JSON.parse(fs.readFileSync(paths.candidateAssignment, "utf8")); assert.deepEqual(v2.map((row) => [row.candidateId, row.candidateTextDigest]).sort(), kd.rows.filter((row: any) => row.releaseDisposition === "RELEASED_TO_TRAIN").map((row: any) => [row.candidateId, row.textSha256]).sort()); });
  await check(36, "reserve remains unauthorized", () => assert.deepEqual([release.releaseContent.V2_RESERVE.candidateCount, release.releaseContent.V2_RESERVE.eligibility], [256, "UNAUTHORIZED"]));
  await check(37, "excluded remains unauthorized", () => assert.deepEqual([release.releaseContent.V2_EXCLUDED.candidateCount, release.releaseContent.V2_EXCLUDED.eligibility], [4, "UNAUTHORIZED"]));
  await check(38, "INTERNAL_TEST remains sealed", () => assert.deepEqual([eligibility.sealedEvaluation.internalTest.count, eligibility.sealedEvaluation.internalTest.rawContentIncluded], [13, false]));
  await check(39, "benchmark remains sealed", () => assert.deepEqual([eligibility.sealedEvaluation.externalBenchmark.count, eligibility.sealedEvaluation.externalBenchmark.rawContentIncluded], [140, false]));
  await check(40, "K-D assignment digest exact", () => assert.equal(release.authorities.kdAssignmentMembershipDigest, "f9ca44ba63979d998f85ef83d7aad88de5fd743ccb2d1da71572d76fe8322cec"));
  await check(41, "7I5 release digest exact", () => assert.equal(release.authorities.i5ReleaseMembershipDigest, "2e01d8d52fd167ed091f67fa42017cbfa50c8aaa64d420adacc92d548b23bcf2"));
  await check(42, "7I5 component digest exact", () => assert.equal(release.authorities.i5SelectedComponentDigest, "8fc79cb77b5940d491fbb9184c3b14c299ca7844eb66dfd16afc8d0ac80237c3"));
  await check(43, "MHS revision exact", () => assert.equal(release.source.revision, "5468f6e118396646b02a2f691e771f6b6d9502ea"));
  await check(44, "CC BY 4.0 exact", () => assert.deepEqual([release.licenseObligations.licenseIdentifier, release.licenseObligations.licenseUrl], ["LICENSE.CC_BY_4_0", "https://creativecommons.org/licenses/by/4.0/legalcode"]));
  await check(45, "commercial training approved", () => assert.equal(release.source.commercialTraining, "APPROVED"));
  await check(46, "redistribution approved", () => assert.equal(release.source.redistribution, "APPROVED"));
  await check(47, "attribution required and preserved", () => { assert.equal(release.licenseObligations.attributionRequired, true); assert.match(release.licenseObligations.attribution, /Measuring Hate Speech/u); });
  await check(48, "change notice required and preserved", () => { assert.equal(release.licenseObligations.changeNoticeRequired, true); assert.ok(release.licenseObligations.changeNotice); });
  await check(49, "every row binds source provenance", () => assert.ok(eligibility.entries.every((row) => row.sourceId === "MEASURING_HATE_SPEECH" && row.sourceRevision === release.source.revision)));
  await check(50, "release binds eligibility SHA", () => assert.equal(release.authorities.eligibilityManifestSha256, crypto.createHash("sha256").update(Buffer.from(canonicalJson(eligibility))).digest("hex")));
  await check(51, "release binds eligibility payload", () => assert.equal(release.authorities.eligibilityManifestPayloadDigest, eligibility.eligibilityPayloadDigest));
  await check(52, "deterministic replay exact", () => assert.equal(canonicalJson(first), canonicalJson(second)));
  await check(53, "TRAIN access accepted", () => assert.deepEqual(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING"), { allowed: true, status: "AUTHORIZED_TRAINING" }));
  await check(54, "VALIDATION access accepted", () => assert.deepEqual(access(validationEntry.candidateId, validationEntry.candidateTextDigest, "VALIDATION"), { allowed: true, status: "AUTHORIZED_VALIDATION" }));
  await check(55, "VALIDATION training misuse rejected", () => assert.equal(access(validationEntry.candidateId, validationEntry.candidateTextDigest, "TRAINING").allowed, false));
  await check(56, "TRAIN validation misuse rejected", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "VALIDATION").allowed, false));
  await check(57, "unknown candidate rejected", () => assert.equal(access("unknown", "0".repeat(64), "TRAINING").status, "DENIED_UNKNOWN_CANDIDATE"));
  await check(58, "wrong text digest rejected", () => assert.equal(access(trainEntry.candidateId, "0".repeat(64), "TRAINING").status, "DENIED_STALE_CANDIDATE"));
  await check(59, "wrong release rejected", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", "UNKNOWN").status, "DENIED_STALE_RELEASE"));
  await check(60, "wrong dataset rejected", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", MHS_COMBINED_RELEASE_VERSION, "UNKNOWN").status, "DENIED_STALE_RELEASE"));
  await check(61, "missing eligibility rejected", () => { const bad: any = clone(eligibility); bad.entries = bad.entries.filter((row: any) => row.candidateId !== trainEntry.candidateId); assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", MHS_COMBINED_RELEASE_VERSION, MHS_COMBINED_DATASET_VERSION, release, bad).allowed, false); });
  await check(62, "tampered eligibility rejected", () => { const bad: any = clone(eligibility); bad.entries[0].candidateTextDigest = "0".repeat(64); assert.throws(() => validateMhsCombinedEligibility(bad)); });
  await check(63, "tampered release binding rejected", () => { const bad: any = clone(release); bad.authorities.eligibilityManifestSha256 = "0".repeat(64); assert.throws(() => validateMhsCombinedDatasetRelease(bad, eligibility)); });
  await check(64, "new release plus old eligibility rejected", () => assert.throws(() => validateMhsCombinedDatasetRelease(release, oldEligibility() as unknown as typeof eligibility)));
  await check(65, "old release plus new eligibility rejected", () => assert.throws(() => validateMhsReleaseManifestArtifact(oldRelease(), eligibility as unknown as MhsTrainingEligibilityManifestArtifact)));
  await check(66, "old loader still accepts V1 TRAIN", () => { const e = oldEligibility(), row = e.entries.find((item) => item.split === "TRAIN")!; assert.equal(authorizeMhsReleasedCandidateAccess({ candidateId: row.candidateId, candidateTextDigest: row.candidateTextDigest, purpose: "TRAINING", releaseVersion: MHS_RELEASE_VERSION, datasetVersion: MHS_DATASET_VERSION }, oldRelease(), e, historicalSplit()).allowed, true); });
  await check(67, "paired publication succeeds", () => { const dir = temp(); try { const published = publishMhsCombinedDatasetRelease(first, dir); assert.ok(fs.existsSync(published.releasePath) && fs.existsSync(published.eligibilityPath)); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
  await check(68, "second publication refused", () => { const dir = temp(); try { publishMhsCombinedDatasetRelease(first, dir); assert.throws(() => publishMhsCombinedDatasetRelease(first, dir), /overwrite refused/u); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
  await check(69, "eligibility-first partial publication rolls back", () => { const dir = temp(); try { assert.throws(() => publishMhsCombinedDatasetRelease(first, dir, (et, ep) => { fs.renameSync(et, ep); throw new Error("simulated"); })); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
  await check(70, "release-only partial publication rolls back", () => { const dir = temp(); try { assert.throws(() => publishMhsCombinedDatasetRelease(first, dir, (_et, _ep, rt, rp) => { fs.renameSync(rt, rp); throw new Error("simulated"); })); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
  await check(71, "fixed successor filenames", () => assert.deepEqual([MHS_COMBINED_RELEASE_FILENAME, MHS_COMBINED_ELIGIBILITY_FILENAME], ["mhs-release-manifest-v2.json", "mhs-training-eligibility-manifest-v2.json"]));
  await check(72, "no raw text field serialized", () => assert.doesNotMatch(canonicalJson(first), /"text"\s*:/u));
  await check(73, "no development projection created", () => assert.equal(release.materializationContract.developmentProjectionCreated, false));
  await check(74, "no development JSONL created", () => assert.equal(release.materializationContract.trainingFilesMaterialized, false));
  await check(75, "no candidate row mutation", () => assert.equal(release.protections.candidateRowsMutated, false));
  await check(76, "no eligibility field mutation", () => assert.equal(release.protections.candidateTrainingEligibleFieldWritten, false));
  await check(77, "INTERNAL_TEST raw accesses zero", () => assert.equal(release.protections.internalTestRawAccesses, 0));
  await check(78, "benchmark raw accesses zero", () => assert.equal(release.protections.benchmarkRawAccesses, 0));
  await check(79, "no training run", () => assert.equal(release.protections.trainingExecuted, false));
  await check(80, "no secret-shaped fields", () => assert.doesNotMatch(canonicalJson(first), /api[_-]?key|password|secret|bearer/iu));
  await check(81, "no model or threshold surface", () => assert.doesNotMatch(canonicalJson(first), /e5Invocations|classifierInvocations|xlm|tokenizer|threshold/iu));
  await check(82, "all upstream authorities byte-identical", () => assert.deepEqual(Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, sha(filename)])), before));
});

test("T6L-8A0 fails closed on each mutated frozen authority", () => {
  for (const key of Object.keys(paths) as (keyof typeof paths)[]) {
    const input: any = bytes(); input[`${key}Bytes`] = Buffer.concat([input[`${key}Bytes`], Buffer.from(" ")]);
    assert.throws(() => createMhsCombinedDatasetRelease(input), /authority mismatch|Invalid/u, key);
  }
});
