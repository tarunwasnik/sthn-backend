import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MHS_DATASET_VERSION,
  MHS_RELEASE_MANIFEST_FILENAME,
  MHS_RELEASE_MANIFEST_SCHEMA,
  MHS_RELEASE_VERSION,
  MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME,
  MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA,
  MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION,
  MhsReleaseAuthorizationEvidence,
  MhsReleaseManifestArtifact,
  MhsTrainingEligibilityManifestArtifact,
  authorizeMhsReleasedCandidateAccess,
  createMhsDatasetRelease,
  decideMhsDatasetReleaseAuthorization,
  validateMhsReleaseManifestArtifact,
  validateMhsTrainingEligibilityManifestArtifact,
} from "../../research/textModerationDataset/mhsDatasetRelease";
import { MhsSplitManifestArtifact } from "../../research/textModerationDataset/mhsSplitManifest";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const candidates = path.join(root, "candidates"); const splits = path.join(root, "splits"); const releaseDir = path.join(root, "release");
const paths = {
  candidatePath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1.json"),
  candidateIntegrityPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-integrity-audit.json"),
  splitManifestPath: path.join(splits, "mhs-split-manifest-v1.json"),
  internalTestFreezePath: path.join(splits, "mhs-internal-test-freeze-v1.json"),
  rEligibilityPlanPath: path.join(releaseDir, "mhs-training-eligibility-release-plan-v1.json"),
  semanticOverlayPath: path.join(root, "semantic-review", "mhs-semantic-grouping-overlay-v1.json"),
  groupingUnionPlanPath: path.join(root, "grouping", "mhs-grouping-union-split-plan-v1.json"),
  contaminationAuditPath: path.join(candidates, "mhs-review-pilot-v1-candidate-v1-contamination-audit.json"),
  acquisitionManifestPath: path.resolve(process.cwd(), "dataset-research", "text-moderation", "acquisition-manifest.json"),
};
const fixedAt = "2026-09-14T00:00:00.000Z";
const temporary = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "sthn-mhs-release-s-"));
const clean = (directory: string): void => fs.rmSync(directory, { recursive: true, force: true });
const sha = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const changed = (directory: string, filename: string): string => { const target = path.join(directory, path.basename(filename)); fs.writeFileSync(target, `${fs.readFileSync(filename, "utf8")} `); return target; };
const create = (directory: string, overrides: Partial<typeof paths> = {}, publishPair?: Parameters<typeof createMhsDatasetRelease>[0]["publishPair"]) => createMhsDatasetRelease({ ...paths, ...overrides, outputDirectory: directory, createdAt: fixedAt, publishPair });
const split = (): MhsSplitManifestArtifact => JSON.parse(fs.readFileSync(paths.splitManifestPath, "utf8"));
const passingEvidence = (): MhsReleaseAuthorizationEvidence => ({ trainAuthoritative: 60, trainQualifying: 60, trainBlocked: 0, validationAuthoritative: 13, validationReady: 13, validationBlocked: 0, protectedInternalTest: 13, internalTestProtectionIntact: true, provenanceLicenseValid: true, contaminationClear: true, groupingIntegrityIntact: true, candidateMembershipUnchanged: true, unresolvedAnnotationPiiLineageCount: 0, immutablePairedPublicationAvailable: true });

test("S immutable release and external eligibility certification", async (t) => {
  const directory = temporary(); const before = new Map(Object.values(paths).map((filename) => [filename, fs.readFileSync(filename)]));
  let result: ReturnType<typeof create>; try { result = create(directory); } catch (error) { clean(directory); throw error; }
  const { release, eligibility } = result;
  const train = eligibility.entries.filter((row) => row.split === "TRAIN"); const validation = eligibility.entries.filter((row) => row.split === "VALIDATION"); const authoritySplit = split();
  const trainEntry = train[0]; const validationEntry = validation[0]; const internalId = authoritySplit.candidateMembershipIndex.find((row) => row.split === "INTERNAL_TEST")!.candidateId;
  const access = (candidateId: string, candidateTextDigest: string, purpose: "TRAINING" | "VALIDATION", releaseVersion: string = MHS_RELEASE_VERSION, datasetVersion: string = MHS_DATASET_VERSION, e = eligibility, r = release) => authorizeMhsReleasedCandidateAccess({ candidateId, candidateTextDigest, purpose, releaseVersion, datasetVersion }, r, e, authoritySplit);
  const mutateRelease = (fn: (value: any) => void): void => { const value = clone(release); fn(value); assert.throws(() => validateMhsReleaseManifestArtifact(value, eligibility)); };
  const mutateEligibility = (fn: (value: any) => void): void => { const value = clone(eligibility); fn(value); assert.throws(() => validateMhsTrainingEligibilityManifestArtifact(value)); };

  await t.test("01 current release is authorized", () => assert.equal(result.authorizationDecision, "AUTHORIZE_MHS_DATASET_RELEASE_V1"));
  await t.test("02 authorization helper passes exact current evidence", () => assert.equal(decideMhsDatasetReleaseAuthorization(passingEvidence()), "AUTHORIZE_MHS_DATASET_RELEASE_V1"));
  await t.test("03 blocked TRAIN prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, trainQualifying: 59, trainBlocked: 1 }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("04 blocked VALIDATION prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, validationReady: 12, validationBlocked: 1 }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("05 changed INTERNAL_TEST protection prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, internalTestProtectionIntact: false }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("06 provenance failure prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, provenanceLicenseValid: false }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("07 contamination failure prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, contaminationClear: false }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("08 grouping failure prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, groupingIntegrityIntact: false }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("09 publication failure prevents authorization", () => { const evidence = passingEvidence(); assert.equal(decideMhsDatasetReleaseAuthorization({ ...evidence, immutablePairedPublicationAvailable: false }), "DO_NOT_AUTHORIZE_MHS_DATASET_RELEASE_V1"); });
  await t.test("10 release schema/version deterministic", () => assert.deepEqual([release.schemaVersion, release.releaseVersion, release.datasetVersion], [MHS_RELEASE_MANIFEST_SCHEMA, MHS_RELEASE_VERSION, MHS_DATASET_VERSION]));
  await t.test("11 eligibility schema/version deterministic", () => assert.deepEqual([eligibility.schemaVersion, eligibility.manifestVersion], [MHS_TRAINING_ELIGIBILITY_MANIFEST_SCHEMA, MHS_TRAINING_ELIGIBILITY_MANIFEST_VERSION]));
  await t.test("12 release and eligibility share authority identity", () => assert.equal(release.releaseAuthorityId, eligibility.releaseAuthorityId));
  await t.test("13 release binds eligibility SHA", () => assert.equal(release.authorities.eligibilityManifestSha256, result.eligibilitySha256));
  await t.test("14 release binds eligibility payload", () => assert.equal(release.authorities.eligibilityManifestPayloadDigest, eligibility.eligibilityPayloadDigest));
  await t.test("15 TRAIN membership count is 60", () => assert.equal(release.releaseContent.TRAIN.candidateCount, 60));
  await t.test("16 VALIDATION membership count is 13", () => assert.equal(release.releaseContent.VALIDATION.candidateCount, 13));
  await t.test("17 protected INTERNAL_TEST count is 13", () => assert.equal(release.releaseContent.INTERNAL_TEST.candidateCount, 13));
  await t.test("18 external TRAINING_ELIGIBLE count is 60", () => assert.equal(train.filter((row) => row.eligibility === "TRAINING_ELIGIBLE").length, 60));
  await t.test("19 external VALIDATION_AUTHORIZED count is 13", () => assert.equal(validation.filter((row) => row.eligibility === "VALIDATION_AUTHORIZED").length, 13));
  await t.test("20 INTERNAL_TEST eligibility is zero", () => assert.deepEqual([release.releaseContent.INTERNAL_TEST.trainingEligibleCount, eligibility.protectedInternalTest.eligibility], [0, "NOT_TRAINING_ELIGIBLE"]));
  await t.test("21 no protected ID is enumerated in eligibility entries", () => { const protectedIds = new Set(JSON.parse(fs.readFileSync(paths.internalTestFreezePath, "utf8")).protectedCandidateIds); assert.ok(eligibility.entries.every((row) => !protectedIds.has(row.candidateId))); });
  await t.test("22 training loader accepts authorized TRAIN", () => assert.deepEqual(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING"), { allowed: true, status: "AUTHORIZED_TRAINING" }));
  await t.test("23 training loader rejects VALIDATION", () => assert.equal(access(validationEntry.candidateId, validationEntry.candidateTextDigest, "TRAINING").status, "DENIED_WRONG_SPLIT"));
  await t.test("24 training loader rejects INTERNAL_TEST", () => assert.equal(access(internalId, "0".repeat(64), "TRAINING").status, "DENIED_PROTECTED_INTERNAL_TEST"));
  await t.test("25 validation loader accepts authorized VALIDATION", () => assert.deepEqual(access(validationEntry.candidateId, validationEntry.candidateTextDigest, "VALIDATION"), { allowed: true, status: "AUTHORIZED_VALIDATION" }));
  await t.test("26 validation loader rejects TRAIN", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "VALIDATION").status, "DENIED_WRONG_SPLIT"));
  await t.test("27 validation loader rejects INTERNAL_TEST", () => assert.equal(access(internalId, "0".repeat(64), "VALIDATION").status, "DENIED_PROTECTED_INTERNAL_TEST"));
  await t.test("28 unknown candidate fails closed", () => assert.equal(access("unknown", "0".repeat(64), "TRAINING").status, "DENIED_UNKNOWN_CANDIDATE"));
  await t.test("29 stale candidate digest fails closed", () => assert.equal(access(trainEntry.candidateId, "0".repeat(64), "TRAINING").status, "DENIED_STALE_CANDIDATE"));
  await t.test("30 stale release version fails closed", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", "OLD").status, "DENIED_STALE_RELEASE"));
  await t.test("31 stale dataset version fails closed", () => assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", MHS_RELEASE_VERSION, "OLD").status, "DENIED_STALE_RELEASE"));
  await t.test("32 missing eligibility fails closed", () => { const value: any = clone(eligibility); value.entries = value.entries.filter((row: any) => row.candidateId !== trainEntry.candidateId); assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", MHS_RELEASE_VERSION, MHS_DATASET_VERSION, value).status, "DENIED_MISSING_ELIGIBILITY"); });
  await t.test("33 blocked eligibility fails closed", () => { const value: any = clone(eligibility); value.entries.find((row: any) => row.candidateId === trainEntry.candidateId).eligibility = "BLOCKED"; assert.equal(access(trainEntry.candidateId, trainEntry.candidateTextDigest, "TRAINING", MHS_RELEASE_VERSION, MHS_DATASET_VERSION, value).status, "DENIED_BLOCKED_ELIGIBILITY"); });
  await t.test("34 release manifest validates canonically", () => assert.doesNotThrow(() => validateMhsReleaseManifestArtifact(release, eligibility)));
  await t.test("35 eligibility manifest validates canonically", () => assert.doesNotThrow(() => validateMhsTrainingEligibilityManifestArtifact(eligibility)));
  await t.test("36 release payload tampering is rejected", () => mutateRelease((value) => { value.source.revision = "changed"; }));
  await t.test("37 eligibility payload tampering is rejected", () => mutateEligibility((value) => { value.entries[0].candidateTextDigest = "0".repeat(64); }));
  await t.test("38 release has exact TRAIN decision distribution", () => assert.deepEqual(release.releaseContent.TRAIN.decisionDistribution, { ALLOW: 40, BLOCK: 20 }));
  await t.test("39 release has exact VALIDATION decision distribution", () => assert.deepEqual(release.releaseContent.VALIDATION.decisionDistribution, { ALLOW: 9, BLOCK: 4 }));
  await t.test("40 PII summaries remain clear", () => assert.deepEqual([release.releaseContent.TRAIN.piiSummary, release.releaseContent.VALIDATION.piiSummary], [{ NONE: 60, REDACTED: 0, REQUIRES_REVIEW: 0, EXCLUDE: 0 }, { NONE: 13, REDACTED: 0, REQUIRES_REVIEW: 0, EXCLUDE: 0 }]));
  await t.test("41 CC BY 4.0 metadata is present", () => assert.deepEqual([release.licenseObligations.licenseIdentifier, release.licenseObligations.attributionRequired, release.licenseObligations.changeNoticeRequired], ["LICENSE.CC_BY_4_0", true, true]));
  await t.test("42 attribution and license link are present", () => { assert.ok(release.licenseObligations.attribution); assert.match(release.licenseObligations.licenseUrl, /^https:\/\//); });
  await t.test("43 change notice is present", () => assert.match(release.licenseObligations.changeNotice, /selected.*human-reviewed.*policy-mapped.*split/i));
  await t.test("44 candidate artifact remains byte-identical", () => assert.ok(before.get(paths.candidatePath)!.equals(fs.readFileSync(paths.candidatePath))));
  await t.test("45 split manifest remains byte-identical", () => assert.ok(before.get(paths.splitManifestPath)!.equals(fs.readFileSync(paths.splitManifestPath))));
  await t.test("46 INTERNAL_TEST freeze remains byte-identical", () => assert.ok(before.get(paths.internalTestFreezePath)!.equals(fs.readFileSync(paths.internalTestFreezePath))));
  await t.test("47 grouping overlay remains byte-identical", () => assert.ok(before.get(paths.semanticOverlayPath)!.equals(fs.readFileSync(paths.semanticOverlayPath))));
  await t.test("48 no candidate trainingEligible field is written", () => { const candidate = JSON.parse(fs.readFileSync(paths.candidatePath, "utf8")); assert.ok(candidate.rows.every((row: any) => row.trainingEligible === false)); assert.equal(eligibility.counts.candidateRowMutationCount, 0); });
  await t.test("49 no training material is produced", () => assert.deepEqual([release.materializationContract.trainingFilesMaterialized, release.materializationContract.releaseContentMaterialized], [false, false]));
  await t.test("50 no training or evaluation occurs", () => assert.deepEqual([release.protections.trainingExecuted, release.protections.evaluationExecuted], [false, false]));
  await t.test("51 frozen 140 is not accessed", () => assert.equal(release.protections.frozen140Accessed, false));
  await t.test("52 INTERNAL_TEST content is not included", () => assert.deepEqual([release.releaseContent.INTERNAL_TEST.contentIncluded, eligibility.protectedInternalTest.contentIncluded], [false, false]));
  await t.test("53 artifacts are deterministic", () => { const second = temporary(); try { const replay = create(second); assert.equal(fs.readFileSync(result.releasePath, "utf8"), fs.readFileSync(replay.releasePath, "utf8")); assert.equal(fs.readFileSync(result.eligibilityPath, "utf8"), fs.readFileSync(replay.eligibilityPath, "utf8")); } finally { clean(second); } });
  clean(directory);
});

for (const [label, key] of [["candidate", "candidatePath"], ["candidate integrity", "candidateIntegrityPath"], ["P split", "splitManifestPath"], ["Q freeze", "internalTestFreezePath"], ["R plan", "rEligibilityPlanPath"], ["semantic overlay", "semanticOverlayPath"], ["grouping plan", "groupingUnionPlanPath"], ["contamination", "contaminationAuditPath"], ["acquisition", "acquisitionManifestPath"]] as const) {
  test(`S enforces ${label} SHA`, () => { const directory = temporary(); try { assert.throws(() => create(path.join(directory, "out"), { [key]: changed(directory, paths[key]) }), /SHA-256/); } finally { clean(directory); } });
}

test("S refuses overwrite of either paired artifact", () => { const directory = temporary(); try { create(directory); assert.throws(() => create(directory), /overwrite refused/); } finally { clean(directory); } });
test("S simulated partial publication leaves no half-authoritative release", () => { const directory = temporary(); try { assert.throws(() => create(directory, {}, (eligibilityTemporaryPath, eligibilityTargetPath) => { fs.renameSync(eligibilityTemporaryPath, eligibilityTargetPath); throw new Error("simulated paired failure"); }), /simulated paired failure/); assert.equal(fs.existsSync(path.join(directory, MHS_RELEASE_MANIFEST_FILENAME)), false); assert.equal(fs.existsSync(path.join(directory, MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME)), false); assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []); } finally { clean(directory); } });
test("S implementation cannot import frozen fixtures or parse candidate content", () => { const source = ["src/research/textModerationDataset/mhsDatasetRelease.ts", "src/scripts/createMhsDatasetRelease.ts"].map((filename) => fs.readFileSync(path.resolve(process.cwd(), filename), "utf8")).join("\n"); assert.doesNotMatch(source, /textModerationFixtures|textModerationEvaluationFixtures|protectedFrozenBenchmarkContaminationDetector|MhsCandidateAdmissionArtifact|validateMhsCandidateAdmissionArtifact/); assert.match(source, /Hash-only: S never parses candidate text/); });
test("S published artifact filenames are fixed", () => assert.deepEqual([MHS_RELEASE_MANIFEST_FILENAME, MHS_TRAINING_ELIGIBILITY_MANIFEST_FILENAME], ["mhs-release-manifest-v1.json", "mhs-training-eligibility-manifest-v1.json"]));
test("S current source authority hashes match accepted values", () => assert.deepEqual([sha(paths.candidatePath), sha(paths.splitManifestPath), sha(paths.internalTestFreezePath), sha(paths.rEligibilityPlanPath)], ["e8fa8da4042f3b87f7eba39e51671f7a21656a167c52f4801bb1429399ba1b5b", "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f", "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", "7e8dfe0da98201e2a80e5c4d01b35a3d21ff48096d46420a33b248aea9b3fb19"]));
